
import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Go to the local dev server
            await page.goto("http://localhost:8788", timeout=90000)

            # Wait for the main heading to be visible to ensure the page has loaded
            await expect(page.get_by_role("heading", name="全局待办事项清单")).to_be_visible(timeout=20000)

            # Create a sample todo to make sure the page is populated
            await page.get_by_placeholder("输入新的待办事项...").fill("这是一个用于样式验证的示例待办事项")
            await page.get_by_role("button", name="添加事项").click()
            await expect(page.get_by_text("这是一个用于样式验证的示例待办事项")).to_be_visible(timeout=10000)

            # Take a screenshot of the entire page
            await page.screenshot(path="jules-scratch/verification/verification.png", full_page=True)

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="jules-scratch/verification/error.png", full_page=True)
        finally:
            await browser.close()

asyncio.run(main())
