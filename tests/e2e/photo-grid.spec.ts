import { expect, test } from '@playwright/test'

test('renders the photo list and opens/closes the lightbox', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await expect(page.getByText('Photos')).toHaveCount(0)
  await expect(page.getByLabel('Photo list')).toBeVisible()
  await expect(page.locator('.app')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )

  const firstPhoto = page.getByRole('button', { name: /^Open / }).first()
  await expect(firstPhoto).toBeVisible()
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(43)

  const viewport = page.viewportSize()
  const firstImageBox = await firstPhoto.locator('img').boundingBox()
  expect(viewport).not.toBeNull()
  expect(firstImageBox).not.toBeNull()
  expect(firstImageBox!.height).toBeLessThanOrEqual(viewport!.height - 80)

  await firstPhoto.click()
  await expect(page.locator('.pswp')).toBeVisible()
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await expect(page.locator('.pswp__counter')).toHaveCount(0)
  await expect(page.locator('.pswp__button--zoom')).toHaveCount(0)
  await expect(page.locator('.pswp__button--arrow')).toHaveCount(0)
  await expect(page.locator('.pswp__button--close')).toHaveCount(0)
  const activeSlide = page.locator('.pswp__item[aria-hidden="false"]')
  const activeImage = activeSlide.locator('.pswp__img:not(.pswp__img--placeholder)')
  const zoomWrap = activeSlide.locator('.pswp__zoom-wrap')
  await expect(activeImage).toBeVisible()
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
  const imageBox = await activeImage.boundingBox()
  expect(imageBox).not.toBeNull()

  const tapImageCenter = async () => {
    if (testInfo.project.name === 'mobile') {
      await activeImage.tap()
      return
    }

    await page.mouse.click(
      imageBox!.x + imageBox!.width / 2,
      imageBox!.y + imageBox!.height / 2,
    )
  }

  await tapImageCenter()
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(initialTransform)
  const zoomedBox = await activeImage.boundingBox()
  expect(zoomedBox).not.toBeNull()
  expect(
    zoomedBox!.x <= 0 ||
      zoomedBox!.x + zoomedBox!.width >= fitViewport!.width ||
      zoomedBox!.y <= 0 ||
      zoomedBox!.y + zoomedBox!.height >= fitViewport!.height,
  ).toBe(true)

  await tapImageCenter()
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe(initialTransform)

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
