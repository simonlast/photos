import { expect, test } from '@playwright/test'

test('renders the photo list and opens/closes the lightbox', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Photos')).toHaveCount(0)
  await expect(page.getByLabel('Photo list')).toBeVisible()

  const firstPhoto = page.getByRole('button', { name: /^Open / }).first()
  await expect(firstPhoto).toBeVisible()

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

  const initialTransform = await zoomWrap.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  const imageBox = await activeImage.boundingBox()
  expect(imageBox).not.toBeNull()

  await page.mouse.click(
    imageBox!.x + imageBox!.width / 2,
    imageBox!.y + imageBox!.height / 2,
  )
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(initialTransform)

  await page.mouse.click(
    imageBox!.x + imageBox!.width / 2,
    imageBox!.y + imageBox!.height / 2,
  )
  await expect
    .poll(() =>
      zoomWrap.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe(initialTransform)

  await page.mouse.click(8, 8)
  await expect(page.locator('.pswp')).toBeHidden()

  await firstPhoto.click()
  await expect(page.locator('.pswp.pswp--open')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.pswp')).toBeHidden()
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(43)
})
