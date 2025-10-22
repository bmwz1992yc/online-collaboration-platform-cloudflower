
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            # Go to the locally running application
            await page.goto("http://127.0.0.1:8788", wait_until="networkidle")

            # Wait for a key element to be visible to ensure the page is loaded
            await page.wait_for_selector("h1", timeout=15000)

            # Take a screenshot of the whole page to show the UI changes
            await page.screenshot(path="jules-scratch/verification/verification.png")

        except Exception as e:
            print(f"An error occurred during Playwright verification: {e}")
            # Try to capture a screenshot even if there's an error for debugging
            await page.screenshot(path="jules-scratch/verification/verification_error.png")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
