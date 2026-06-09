import { expect, test, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'

const photos = JSON.parse(
  readFileSync('src/data/photos.generated.json', 'utf8'),
) as unknown[]
const totalPhotos = photos.length
const initialPhotoCount = Math.min(20, totalPhotos)
const photoLoadBatchSize = 10

test('renders the photo list and opens/closes the lightbox', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.getByText('Photos')).toHaveCount(0)
  const list = page.getByLabel('Photo list')
  await expect(list).toBeVisible()
  await expect(list).toHaveAttribute('data-loaded-count', String(initialPhotoCount))
  await expect(list).toHaveAttribute('data-total-count', String(totalPhotos))
  await expect(page.locator('.app')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )

  const firstPhoto = page.getByRole('button', { name: /^Open / }).first()
  const firstImage = firstPhoto.locator('img')
  await expect(firstPhoto).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(
    initialPhotoCount,
  )
  await expect(page.locator('.photo-date')).toHaveCount(0)
  await expectImageDecoded(firstImage)
  await expect
    .poll(() =>
      firstImage.evaluate((node) => (node as HTMLImageElement).currentSrc),
    )
    .toContain('-display.avif')

  const viewport = page.viewportSize()
  const firstImageBox = await firstImage.boundingBox()
  expect(viewport).not.toBeNull()
  expect(firstImageBox).not.toBeNull()
  expect(firstImageBox!.height).toBeLessThanOrEqual(viewport!.height - 80)

  await firstPhoto.click()
  await expect(page.locator('.pswp')).toBeVisible()
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await page.waitForTimeout(1_200)
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await expect(page.locator('.pswp__counter')).toHaveCount(0)
  await expect(page.locator('.pswp__button--zoom')).toHaveCount(0)
  await expect(page.locator('.pswp__button--arrow')).toHaveCount(0)
  await expect(page.locator('.pswp__button--close')).toHaveCount(0)
  const activeSlide = page.locator('.pswp__item[aria-hidden="false"]')
  const activeImage = activeSlide.locator('.pswp__img:not(.pswp__img--placeholder)')
  const zoomWrap = activeSlide.locator('.pswp__zoom-wrap')
  await expect(activeImage).toBeVisible()
  await expectImageDecoded(activeImage)
  await expect
    .poll(() =>
      activeImage.evaluate((node) => (node as HTMLImageElement).currentSrc),
    )
    .toContain('-full.')
  const fitBox = await activeImage.boundingBox()
  const fitViewport = page.viewportSize()
  expect(fitBox).not.toBeNull()
  expect(fitViewport).not.toBeNull()
  expect(fitBox!.x).toBeGreaterThanOrEqual(11)
  expect(fitBox!.y).toBeGreaterThanOrEqual(11)
  expect(fitBox!.x + fitBox!.width).toBeLessThanOrEqual(fitViewport!.width - 11)
  expect(fitBox!.y + fitBox!.height).toBeLessThanOrEqual(
    fitViewport!.height - 11,
  )

  const initialTransform = await zoomWrap.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  const tapImageCenter = async () => {
    const currentViewport = page.viewportSize()
    const currentBox = await activeImage.boundingBox()
    expect(currentViewport).not.toBeNull()
    expect(currentBox).not.toBeNull()
    const x = clamp(
      currentViewport!.width / 2,
      currentBox!.x + 1,
      currentBox!.x + currentBox!.width - 1,
    )
    const y = clamp(
      currentViewport!.height / 2,
      currentBox!.y + 1,
      currentBox!.y + currentBox!.height - 1,
    )

    if (testInfo.project.name === 'mobile') {
      await page.touchscreen.tap(x, y)
      return
    }

    await page.mouse.click(x, y)
  }

  await tapImageCenter()
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(initialTransform)
  await page.waitForTimeout(1_200)
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await expect.poll(async () => imageTouchesViewportEdge(activeImage)).toBe(true)

  await tapImageCenter()
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe(initialTransform)
  await page.waitForTimeout(1_200)
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()

  if (testInfo.project.name === 'mobile') {
    await page.touchscreen.tap(8, 8)
  } else {
    await page.mouse.click(8, 8)
  }
  await expect(page.locator('.pswp')).toBeHidden()

  await firstPhoto.click()
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.pswp')).toBeHidden()
})

test('progressively loads more photos while scrolling', async ({ page }) => {
  await page.goto('/')
  const list = page.getByLabel('Photo list')

  for (
    let expectedCount = initialPhotoCount;
    expectedCount <= totalPhotos;
    expectedCount = Math.min(expectedCount + photoLoadBatchSize, totalPhotos)
  ) {
    await expect(list).toHaveAttribute(
      'data-loaded-count',
      String(expectedCount),
    )
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(
      expectedCount,
    )

    if (expectedCount === totalPhotos) {
      break
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  }
})

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function imageTouchesViewportEdge(locator: Locator) {
  const box = await locator.boundingBox()
  const viewport = locator.page().viewportSize()

  if (!box || !viewport) {
    return false
  }

  return (
    box.x <= 0 ||
    box.x + box.width >= viewport.width ||
    box.y <= 0 ||
    box.y + box.height >= viewport.height
  )
}

async function expectImageDecoded(locator: Locator) {
  await expect
    .poll(async () =>
      locator.evaluate((node) => {
        const image = node as HTMLImageElement
        return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
      }),
    )
    .toBe(true)
}
