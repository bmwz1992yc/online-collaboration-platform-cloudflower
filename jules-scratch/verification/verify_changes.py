
import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # Log in
        page.goto("http://127.0.0.1:8788/login.html")
        page.wait_for_load_state("domcontentloaded")
        page.fill('#username', 'admin')
        page.fill('#password', '112233')
        login_button = page.locator('button[type="submit"]')
        login_button.click()
        page.wait_for_url("http://127.0.0.1:8788/")
        page.wait_for_load_state("domcontentloaded")

        # Check for smaller "Operation History" text
        operation_history_summary = page.locator("summary:has-text('操作历史')").first
        expect(operation_history_summary).to_have_class(re.compile(r".*text-xs.*"))

        # Expand the "Recently Deleted" section
        deleted_items_button = page.locator("button:has-text('最近删除 (20天内)')")
        deleted_items_button.click()

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/verification.png")

    except Exception as e:
        print(f"An error occurred: {e}")
        print(page.content())

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
