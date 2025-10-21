
import re
from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Go to admin page
    page.goto("http://localhost:8789")

    # Expect a title to contain a substring.
    expect(page).to_have_title(re.compile("全局待办事项清单"))

    # 1. Create a new To-Do
    todo_text = "My new test to-do"
    page.get_by_placeholder("输入新的待办事项...").fill(todo_text)
    page.get_by_role("button", name="添加事项").click()

    # Wait for the new to-do to appear and ensure it is visible
    new_todo_locator = page.locator(f"li:has-text('{todo_text}')")
    expect(new_todo_locator).to_be_visible()

    # 2. Create a new Item
    item_name = "My new test item"
    page.get_by_placeholder("物品名称...").fill(item_name)
    page.get_by_role("button", name="添加交接物品").click()

    # Wait for the new item to appear in the main list
    new_item_locator = page.locator(f"li:has-text('{item_name}')")
    expect(new_item_locator).to_be_visible()

    # 3. Edit the To-Do
    todo_edit_button = new_todo_locator.get_by_role("button", name="编辑")
    todo_edit_button.click()

    page.locator("#edit-todo-modal input[type='text']").fill("Edited to-do")
    page.locator("#edit-todo-modal button[type='submit']").click()
    expect(page.get_by_text("Edited to-do")).to_be_visible()

    # 4. Add a progress update
    progress_textarea = page.locator("li:has-text('Edited to-do')").get_by_placeholder("添加进度更新...")
    progress_textarea.fill("This is a progress update.")

    add_update_button = page.locator("li:has-text('Edited to-do')").get_by_role("button", name="添加更新")
    add_update_button.click()
    expect(page.get_by_text("This is a progress update.")).to_be_visible()

    # 5. Collapse the items list
    page.get_by_role("button", name="折叠").click()
    expect(page.locator("#kept-items-list")).to_be_hidden()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
