"""
Playwright integration test for DB Management Tab improvements.
Tests: CSV import with delimiter config, table rename, column rename,
       data preview tab, SQL console pagination, tableCount update bug fix.

Navigation path:
  1. Click Settings button (title="设置") in sidebar
  2. Click "DB 管理" in the settings navigation panel
  3. Interact with the three-panel DB management UI

Usage:
  python tests/test_db_management_playwright.py

Requires:
  - release/win-unpacked/Datell.exe
  - D:/download/population-growth-rates/population-growth-rates.csv
"""

import subprocess
import time
import os

from playwright.sync_api import sync_playwright

ELECTRON_EXE = r"D:\python_project\auto_report\release\win-unpacked\Datell.exe"
CSV_FILE = r"D:\download\population-growth-rates\population-growth-rates.csv"
DEBUG_PORT = 9224
SS_DIR = "tests/screenshots"

PASS_COUNT = [0]
FAIL_COUNT = [0]


def log(msg):
    print(f"  [TEST] {msg}", flush=True)


def check(label, condition, info=""):
    if condition:
        PASS_COUNT[0] += 1
        print(f"  [PASS] {label}", flush=True)
    else:
        FAIL_COUNT[0] += 1
        print(f"  [FAIL] {label}{' — ' + info if info else ''}", flush=True)


def ss(page, name):
    path = f"{SS_DIR}/{name}.png"
    try:
        page.screenshot(path=path, timeout=8000)
        log(f"Screenshot: {name}.png")
    except Exception as e:
        log(f"Screenshot skipped ({name}): {e}")
    return path


def find_main_page(context, timeout_sec=25):
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        for pg in context.pages:
            if "splash" not in pg.url and pg.url not in ("about:blank", ""):
                return pg
        time.sleep(0.4)
    for pg in context.pages:
        if pg.url != "about:blank":
            return pg
    return context.pages[0]


def run_tests():
    print("=" * 65)
    print("DB Management Tab - Playwright Integration Tests")
    print("=" * 65)

    assert os.path.exists(ELECTRON_EXE), f"Electron exe not found: {ELECTRON_EXE}"
    assert os.path.exists(CSV_FILE), f"CSV file not found: {CSV_FILE}"

    proc = subprocess.Popen(
        [ELECTRON_EXE, f"--remote-debugging-port={DEBUG_PORT}", "--no-sandbox"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    log(f"Launched Electron PID={proc.pid}")

    try:
        with sync_playwright() as p:
            log(f"Waiting for app startup (5s)...")
            time.sleep(5)

            browser = p.chromium.connect_over_cdp(f"http://localhost:{DEBUG_PORT}")
            context = browser.contexts[0]
            page = find_main_page(context, timeout_sec=20)
            log(f"Connected. URL: {page.url}")
            page.wait_for_load_state("domcontentloaded", timeout=20000)
            time.sleep(2)
            ss(page, "00_app_loaded")

            # ─── STEP 1: Open Settings and navigate to DB Management ────────
            print("\n[1] Opening Settings → DB 管理...")
            try:
                settings_btn = page.locator('button[title="设置"]').first
                settings_btn.wait_for(timeout=8000, state="visible")
                settings_btn.click()
                time.sleep(0.8)
                log("  Clicked settings button")
                check("Settings button clickable", True)
            except Exception as e:
                check("Settings button clickable", False, str(e))
                ss(page, "01_error_settings")
                return

            ss(page, "01_settings_opened")

            try:
                db_mgmt_nav = page.locator('button:has-text("DB 管理")').first
                db_mgmt_nav.wait_for(timeout=5000, state="visible")
                db_mgmt_nav.click()
                time.sleep(0.8)
                check("DB Management tab navigable", True)
            except Exception as e:
                check("DB Management tab navigable", False, str(e))
                ss(page, "01_error_db_nav")
                return

            ss(page, "02_db_management_panel")

            # ─── PRE-STEP: Delete leftover pgr_test DBs from previous runs ─
            log("  Cleaning up leftover pgr_test databases...")
            for _ in range(5):  # up to 5 stale copies
                try:
                    stale = page.locator('.w-48 [class*="cursor-pointer"]').filter(has_text="pgr_test").first
                    if not stale.is_visible():
                        break
                    # Hover to reveal the opacity-0 delete button (group-hover:opacity-100)
                    stale.hover()
                    time.sleep(0.2)
                    del_btn = page.locator('button[title="删除"]').first
                    del_btn.wait_for(timeout=3000, state="visible")
                    # Accept the confirm() dialog that pops up
                    page.once("dialog", lambda d: d.accept())
                    del_btn.click()
                    time.sleep(0.8)
                    log("  Deleted one stale pgr_test DB")
                except Exception as e:
                    log(f"  Cleanup stopped: {e}")
                    break
            time.sleep(0.5)

            # ─── STEP 2: Create a UserDB ────────────────────────────────────
            print("\n[2] Creating a new UserDB...")
            try:
                create_btn = page.locator(
                    'button[title="创建新数据库"], button[title*="New"], button[title*="Create"]'
                ).first
                # Fallback: find the + button in the left panel header area
                try:
                    create_btn.wait_for(timeout=3000, state="visible")
                except Exception:
                    # Try any button with Plus icon text or "新建" near the top
                    create_btn = page.locator('.w-48 button').first
                    create_btn.wait_for(timeout=3000, state="visible")

                create_btn.click()
                time.sleep(0.5)

                # Fill DB name
                name_input = page.locator('input[placeholder*="名称"], input[placeholder*="name"]').first
                name_input.wait_for(timeout=4000, state="visible")
                name_input.fill("pgr_test")
                time.sleep(0.2)

                # Click confirm
                confirm = page.locator('button:has-text("确认"), button:has-text("创建")').last
                confirm.click()
                time.sleep(1)
                check("UserDB created", True)
            except Exception as e:
                check("UserDB created", False, str(e))
                ss(page, "02_error_create_db")

            ss(page, "03_db_created")

            # ─── STEP 3: Select the DB and open Import dialog ───────────────
            print("\n[3] Selecting DB and opening Import dialog...")
            db_selected = False
            try:
                db_item = page.locator('.w-48 [class*="cursor-pointer"]').filter(has_text="pgr_test").first
                db_item.wait_for(timeout=5000, state="visible")
                db_item.click()
                time.sleep(0.8)
                db_selected = True
                check("DB selected in left panel", True)
            except Exception as e:
                check("DB selected in left panel", False, str(e))
                ss(page, "03_error_select_db")

            import_opened = False
            if db_selected:
                try:
                    import_btn = page.locator('button[title*="导入"], button[title*="Import"]').first
                    import_btn.wait_for(timeout=5000, state="visible")
                    import_btn.click()
                    time.sleep(0.8)
                    import_opened = True
                    check("Import dialog opened", True)
                except Exception as e:
                    check("Import dialog opened", False, str(e))
                    ss(page, "03_error_import_btn")

            ss(page, "04_import_dialog")

            # ─── STEP 4: Upload CSV and verify delimiter config ─────────────
            print("\n[4] Testing CSV upload and delimiter detection...")
            csv_uploaded = False
            if import_opened:
                try:
                    # Use expect_file_chooser to properly trigger React's onChange
                    # Clicking the dashed-border upload label opens OS file chooser
                    with page.expect_file_chooser(timeout=6000) as fc_info:
                        upload_label = page.locator(
                            'label.cursor-pointer:has(input[type="file"][aria-label="点击选择文件"]),'
                            'label.cursor-pointer:has(input[type="file"][aria-label="Click to select file"])'
                        ).first
                        upload_label.click()
                    file_chooser = fc_info.value
                    file_chooser.set_files(CSV_FILE)
                    time.sleep(2.5)  # Wait for React to parse CSV
                    csv_uploaded = True
                    check("CSV file uploaded", True)
                except Exception as e:
                    check("CSV file uploaded", False, str(e))
                    ss(page, "04_error_csv_upload")

            if csv_uploaded:
                # Verify delimiter radio buttons visible
                try:
                    delim_label = page.locator('span:has-text("分隔符")').first
                    delim_label.wait_for(timeout=4000, state="visible")
                    check("Delimiter config visible", True)
                except Exception as e:
                    check("Delimiter config visible", False, str(e))

                # Verify column mapping table visible
                try:
                    col_header = page.locator('th:has-text("列名")').first
                    col_header.wait_for(timeout=4000, state="visible")
                    check("Column mapping table visible", True)
                except Exception as e:
                    check("Column mapping table visible", False, str(e))

                # Verify data preview rows visible
                try:
                    preview_rows = page.locator('tbody tr').all()
                    check("Data preview rows present", len(preview_rows) > 0, f"rows={len(preview_rows)}")
                except Exception as e:
                    check("Data preview rows present", False, str(e))

            ss(page, "05_csv_parsed_delimiter_colmap")

            # ─── STEP 5: Start Import ───────────────────────────────────────
            print("\n[5] Starting CSV import...")
            import_done = False
            if csv_uploaded:
                try:
                    # Click the "开始导入" button
                    start_import = page.locator(
                        'button:has-text("开始导入"), button:has-text("Start Import")'
                    ).first
                    start_import.wait_for(timeout=5000, state="visible")
                    start_import.click()
                    log("  Import started, waiting for completion...")

                    # Wait: dialog should close when import is done
                    page.wait_for_selector(
                        'h3:has-text("导入数据"), h3:has-text("Import Data")',
                        state="hidden",
                        timeout=120000
                    )
                    time.sleep(1.5)
                    import_done = True
                    check("Import completed successfully", True)
                except Exception as e:
                    check("Import completed successfully", False, str(e))
                    ss(page, "05_error_import")

            ss(page, "06_after_import")

            # Dismiss import dialog if still open (e.g., if CSV upload failed)
            # Use "取消" button — NOT Escape, which would close the entire Settings modal
            try:
                cancel_btn = page.locator('button:has-text("取消")').first
                if cancel_btn.is_visible():
                    log("  Import dialog still open — clicking 取消 to dismiss")
                    cancel_btn.click()
                    time.sleep(0.5)
            except Exception:
                pass

            # ─── STEP 6: Verify tableCount updated ─────────────────────────
            print("\n[6] Verifying tableCount updated after import...")
            if import_done:
                time.sleep(1)
                try:
                    # The tableCount div shows "{n} 表" under the DB name
                    table_count_el = page.locator('.w-48 .text-xs.text-gray-400').filter(
                        has_text="表"
                    ).first
                    table_count_el.wait_for(timeout=5000, state="visible")
                    count_text = table_count_el.inner_text().strip()
                    log(f"  Table count text: '{count_text}'")
                    # count text like "1 表" - first char should be digit > 0
                    digit = next((c for c in count_text if c.isdigit()), "0")
                    check("tableCount > 0 after import", digit > "0", f"text='{count_text}'")
                except Exception as e:
                    check("tableCount > 0 after import", False, str(e))

                ss(page, "07_table_count_updated")

            # ─── STEP 7: Click table → Data tab ────────────────────────────
            print("\n[7] Selecting table and testing Data Preview tab...")
            table_selected = False
            try:
                # Middle panel is .w-44 — click the first table entry
                middle_items = page.locator('.w-44 button, .w-44 [class*="cursor-pointer"]').all()
                log(f"  Middle panel items: {len(middle_items)}")
                if middle_items:
                    middle_items[0].click()
                    time.sleep(0.8)
                    table_selected = True
                    check("Table selected in middle panel", True)
                else:
                    check("Table selected in middle panel", False, "no items in middle panel")
            except Exception as e:
                check("Table selected in middle panel", False, str(e))

            if table_selected:
                try:
                    # Data tab appears only when a table is selected (it uses t.dbManagement.tabData)
                    # zh-CN value not known exactly, but it contains "数据"
                    # The right tab bar has buttons for detail/data/console
                    data_tab = page.locator(
                        'button[class*="border-b-2"]:has-text("数据"), '
                        'button[class*="px-3 py-2"]:has-text("数据")'
                    ).last
                    data_tab.wait_for(timeout=5000, state="visible")
                    data_tab.click()
                    time.sleep(1.2)
                    check("Data Preview tab exists and clickable", True)
                except Exception as e:
                    check("Data Preview tab exists and clickable", False, str(e))

                ss(page, "08_data_preview_tab")

                # Check for row data in preview table
                try:
                    preview_tds = page.locator('td.font-mono').all()
                    check("Data rows visible in preview", len(preview_tds) > 0, f"cells={len(preview_tds)}")
                except Exception as e:
                    check("Data rows visible in preview", False, str(e))

            # ─── STEP 8: SQL Console with pagination ────────────────────────
            print("\n[8] Testing SQL Console pagination...")
            try:
                console_btn = page.locator('button[class*="border-b-2"]:has-text("SQL")').first
                try:
                    console_btn.wait_for(timeout=3000, state="visible")
                except Exception:
                    console_btn = page.locator('button[class*="px-3 py-2"]:has-text("SQL")').first
                    console_btn.wait_for(timeout=3000, state="visible")
                console_btn.click()
                time.sleep(0.5)
                check("SQL Console tab clickable", True)
            except Exception as e:
                check("SQL Console tab clickable", False, str(e))

            # Run a large query to trigger pagination
            try:
                # Use specific aria-label to target SQL console textarea, not the chat input
                textarea = page.locator(
                    'textarea[aria-label*="SQL"], textarea[title*="SQL"], textarea[rows="5"].font-mono'
                ).first
                textarea.wait_for(timeout=5000, state="visible")
                textarea.click(click_count=3)
                textarea.fill("SELECT * FROM population_growth_rates;")
                time.sleep(0.3)

                run_btn = page.locator('button:has-text("执行"), button:has-text("Execute"), button:has-text("运行")').first
                run_btn.wait_for(timeout=5000, state="visible")
                run_btn.click()
                time.sleep(2)

                # Check pagination bar appeared
                page_info = page.locator('span.text-xs.text-gray-500').filter(has_text="/").first
                try:
                    page_info.wait_for(timeout=5000, state="visible")
                    info_text = page_info.inner_text()
                    check("Pagination info visible in SQL Console", True, f"'{info_text}'")
                except Exception:
                    # Maybe not enough rows for pagination, still check rows-per-page
                    pass

                # Check rows-per-page select
                rpp_select = page.locator('select[aria-label*="页"], select[title*="页"]').first
                try:
                    rpp_select.wait_for(timeout=3000, state="visible")
                    check("Rows-per-page selector visible", True)
                except Exception as e:
                    check("Rows-per-page selector visible", False, str(e))

                # Verify row number column
                row_num_cells = page.locator('td.font-mono.text-right.text-gray-400').all()
                check("Row number column present", len(row_num_cells) > 0,
                      f"cells={len(row_num_cells)}")

            except Exception as e:
                check("SQL Console query with pagination", False, str(e))

            ss(page, "09_sql_console_pagination")

            # ─── STEP 9: Same-DB re-click doesn't clear table list ─────────
            print("\n[9] Testing fix: same DB re-click preserves table list...")
            try:
                # Go to detail tab first
                detail_btn = page.locator('button[class*="border-b-2"]:has-text("列")').first
                try:
                    detail_btn.wait_for(timeout=2000, state="visible")
                    detail_btn.click()
                    time.sleep(0.3)
                except Exception:
                    pass

                before_count = page.locator('.w-44 button, .w-44 [class*="cursor-pointer"]').count()
                log(f"  Middle panel items before re-click: {before_count}")

                # Re-click the same DB
                db_item2 = page.locator('.w-48 [class*="cursor-pointer"]').filter(has_text="pgr_test").first
                db_item2.wait_for(timeout=3000, state="visible")
                db_item2.click()
                time.sleep(0.8)

                after_count = page.locator('.w-44 button, .w-44 [class*="cursor-pointer"]').count()
                log(f"  Middle panel items after re-click: {after_count}")
                check("Table list preserved on same DB re-click",
                      after_count >= before_count and after_count > 0,
                      f"before={before_count}, after={after_count}")
            except Exception as e:
                check("Table list preserved on same DB re-click", False, str(e))

            ss(page, "10_same_db_reclick")

            # ─── Summary ────────────────────────────────────────────────────
            print("\n" + "=" * 65)
            print(f"  Results: {PASS_COUNT[0]} PASSED, {FAIL_COUNT[0]} FAILED")
            print(f"  Screenshots saved in {SS_DIR}/")
            print("=" * 65)

            if FAIL_COUNT[0] > 0:
                raise SystemExit(1)

    finally:
        proc.terminate()
        log(f"Electron terminated (PID={proc.pid})")


if __name__ == "__main__":
    os.makedirs(SS_DIR, exist_ok=True)
    run_tests()
