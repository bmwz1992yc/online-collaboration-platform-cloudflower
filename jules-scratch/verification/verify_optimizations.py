from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    print("Navigating to http://localhost:8788")
    page.goto("http://localhost:8788", wait_until="networkidle")
    page.wait_for_selector('ul#all-todos-list li')

    # 1. Initial load screenshot
    print("Taking initial screenshot")
    page.screenshot(path="jules-scratch/verification/01_initial_load.png")

    # 2. Toggle todo details
    first_todo_toggle = page.locator('li[data-id] button').first
    if first_todo_toggle.is_visible():
        print("Clicking first todo toggle")
        first_todo_toggle.click()
        page.wait_for_timeout(500) # Wait for animation
        print("Taking todo expanded screenshot")
        page.screenshot(path="jules-scratch/verification/02_todo_expanded.png")
    else:
        print("Could not find first todo toggle")

    # 3. Toggle kept items
    kept_items_toggle = page.get_by_text("当前交接物品")
    if kept_items_toggle.is_visible():
        print("Clicking kept items toggle")
        kept_items_toggle.click()
        page.wait_for_timeout(500) # Wait for animation
        print("Taking kept items expanded screenshot")
        page.screenshot(path="jules-scratch/verification/03_kept_items_expanded.png")
    else:
        print("Could not find kept items toggle")

    browser.close()
    print("Script finished")

with sync_playwright() as playwright:
    run(playwright)
