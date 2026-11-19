"""Run against a Vite server: python frontend/src/project-assistant.browser.test.py."""
import json
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


orders = [
    {"id": "o1", "projectId": "p1", "title": "订单一", "type": "hotel", "checkIn": "2027-01-01", "checkOut": "2027-01-02"},
    {"id": "o2", "projectId": "p2", "title": "订单二", "type": "hotel", "checkIn": "2027-01-01", "checkOut": "2027-01-02"},
]
alerts = [
    {"id": "a1", "orderId": "o1", "otherOrderId": "o2", "status": "pending", "readAt": "now", "severity": "hard", "details": "未解决跨行程冲突", "title": "冲突提醒"},
    {"id": "a2", "orderId": "o1", "otherOrderId": "o2", "status": "resolved", "severity": "hard", "details": "已解决跨行程冲突", "title": "已解决通知"},
]
project = {
    "id": "p1", "destination": "杭州", "days": 1, "status": "active",
    "runs": [
        {"id": "r1", "triggerType": "intent_conflict", "requestSummary": "冲突请求", "responseSummary": "已解决的冲突回复", "status": "completed"},
        {"id": "r2", "triggerType": "user_request", "requestSummary": "普通请求", "responseSummary": "普通对话回复", "status": "completed"},
        {"id": "r3", "triggerType": "booking_conflict", "requestSummary": "部分冲突", "responseSummary": "仍有未解决冲突", "status": "completed"},
        {"id": "r4", "triggerType": "user_request", "requestSummary": "关联普通请求", "responseSummary": "关联事件的普通回复", "status": "completed"},
    ], "memoryPrompts": [], "itinerary": None,
    "events": [
        {"id": "e1", "orderId": "o1", "status": "pending", "details": "未解决项目冲突", "createdAt": "2026-01-01"},
        {"id": "e2", "orderId": "o1", "status": "resolved", "details": "已解决项目冲突", "createdAt": "2026-01-02"},
        {"id": "e3", "runId": "r1", "status": "resolved"},
        {"id": "e4", "runId": "r3", "status": "resolved"},
        {"id": "e5", "runId": "r3", "status": "pending"},
        {"id": "e6", "runId": "r4", "status": "resolved"},
    ],
}


def mock_api(route):
    path = urlparse(route.request.url).path
    if path == "/api/projects":
        data = {"projects": [project]}
    elif path.startswith("/api/projects/p1"):
        data = project
    elif path == "/api/alerts":
        data = {"alerts": alerts}
    elif path == "/api/orders":
        data = {"orders": orders}
    elif path == "/api/memories":
        data = {"memories": []}
    elif path == "/api/plans":
        data = {"plans": []}
    else:
        data = {}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(data, ensure_ascii=False))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (1440, 390):
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.route("**/api/**", mock_api)
        page.goto("http://127.0.0.1:5174/#AI%E8%A1%8C%E7%A8%8B%E5%8A%A9%E6%89%8B?project=p1")
        page.get_by_text("未解决项目冲突").wait_for()
        assert page.get_by_text("已解决项目冲突").count() == 0
        assert page.get_by_text("已解决的冲突回复").count() == 0
        assert page.get_by_text("普通对话回复").count() == 1
        assert page.get_by_text("关联事件的普通回复").count() == 1
        assert page.get_by_text("仍有未解决冲突").count() == 1
        if width == 1440:
            page.get_by_role("button", name="消息", exact=True).click()
            assert page.get_by_text("已解决通知").count() == 1
            assert page.get_by_text("冲突提醒").count() == 1
            page.get_by_role("button", name="消息", exact=True).click()
        page.get_by_role("button", name="全屏查看行程").click()
        page.get_by_role("button", name="收起对话栏").click()
        page.get_by_role("button", name="展开对话栏").click()
        page.get_by_role("button", name="全屏查看对话").click()
        box = page.locator(".project-chat-expanded").bounding_box()
        assert abs(box["x"]) < 1 and abs(box["width"] - width) < 1
        page.keyboard.press("Escape")
        assert page.locator(".project-grid.itinerary-expanded").count() == 1
        page.keyboard.press("Escape")
        assert page.locator(".project-grid.itinerary-expanded").count() == 0
        page.locator(".conflict-link").click()
        page.get_by_text("未解决跨行程冲突").first.wait_for()
        assert page.get_by_text("已解决跨行程冲突").count() == 0
        page.get_by_role("button", name="全屏查看对话").click()
        box = page.locator(".conflict-chat-expanded").bounding_box()
        assert abs(box["x"]) < 1 and abs(box["width"] - width) < 1
        page.keyboard.press("Escape")
        assert page.locator(".conflict-chat-expanded").count() == 0
        alerts[0]["status"] = "resolved"
        page.get_by_role("button", name="刷新冲突").click()
        page.get_by_text("目前没有跨行程订单冲突").wait_for()
        assert page.get_by_text("暂无可管理的冲突").count() == 1
        alerts[0]["status"] = "pending"
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.get_by_role("button", name="我的订单", exact=True).first.click()
        page.go_back()
        page.get_by_text("未解决项目冲突").wait_for()
        page.go_forward()
        assert "我的订单" in page.url or "%E6%88%91" in page.url
        page.close()
        print(f"{width}px: passed")
    browser.close()
