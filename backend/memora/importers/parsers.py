"""匯入檔案解析：JSON（MEMORA 匯出或通用陣列）、CSV、Markdown、純文字。

解析只產生「候選記憶」，使用者預覽確認後才會寫入。
注意：ChatGPT / Claude / Gemini 的完整對話匯出檔需要 AI 擷取（Phase 2 的 Extraction Engine），
這裡只處理已整理成條列或表格的記憶資料。
"""

import csv
import io
import json
import re
from dataclasses import dataclass, field
from typing import Any

from memora.models import MEMORY_CATEGORIES

FORMATS = ("json", "csv", "markdown", "text")
MAX_ITEMS = 5000

_CATEGORY_ALIASES = {
    **{c: c for c in MEMORY_CATEGORIES},
    "preference": "preferences",
    "project": "projects",
    "decision": "decisions",
    "tech": "technical",
    "temp": "temporary",
    "個人資料": "profile",
    "背景": "profile",
    "偏好": "preferences",
    "專案": "projects",
    "知識": "knowledge",
    "決策": "decisions",
    "技術": "technical",
    "暫時": "temporary",
}


@dataclass
class Parsed:
    items: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)


def normalize_category(value: Any, default: str) -> str | None:
    if value is None or str(value).strip() == "":
        return default
    return _CATEGORY_ALIASES.get(str(value).strip().lower())


def _split_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw = [str(v) for v in value]
    else:
        raw = re.split(r"[;,，、|]", str(value))
    out: list[str] = []
    for t in raw:
        t = t.strip().lower().lstrip("#")
        if t and t not in out and len(t) <= 50:
            out.append(t)
    return out[:20]


def detect_format(filename: str) -> str | None:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {"json": "json", "csv": "csv", "md": "markdown", "markdown": "markdown", "txt": "text"}.get(ext)


def _add(out: Parsed, row: int, content: Any, category: Any, tags: Any, default_category: str) -> None:
    text = str(content or "").strip()
    if not text:
        out.errors.append({"row": row, "message": "內容為空"})
        return
    if len(text) > 10_000:
        out.errors.append({"row": row, "message": "內容超過 10000 字"})
        return
    cat = normalize_category(category, default_category)
    if cat is None:
        out.errors.append({"row": row, "message": f"未知的分類：{category}"})
        return
    out.items.append({"content": text, "category": cat, "tags": _split_tags(tags)})


def parse_json(data: str, default_category: str) -> Parsed:
    out = Parsed()
    try:
        doc = json.loads(data)
    except json.JSONDecodeError as e:
        out.errors.append({"row": 0, "message": f"JSON 格式錯誤：第 {e.lineno} 行"})
        return out
    if isinstance(doc, dict):
        doc = doc.get("memories", doc.get("items"))
    if not isinstance(doc, list):
        out.errors.append({"row": 0, "message": "JSON 需為陣列，或含 memories 陣列的物件"})
        return out
    for i, entry in enumerate(doc[:MAX_ITEMS], start=1):
        if isinstance(entry, str):
            _add(out, i, entry, None, None, default_category)
        elif isinstance(entry, dict):
            _add(
                out,
                i,
                entry.get("content") or entry.get("text") or entry.get("memory"),
                entry.get("category"),
                entry.get("tags"),
                default_category,
            )
        else:
            out.errors.append({"row": i, "message": "項目需為字串或物件"})
    return out


def parse_csv(data: str, default_category: str) -> Parsed:
    out = Parsed()
    reader = csv.DictReader(io.StringIO(data))
    fields = [f.strip().lower() for f in reader.fieldnames or []]
    if "content" not in fields:
        out.errors.append({"row": 1, "message": "CSV 需要 content 欄位（可選 category、tags）"})
        return out
    for i, row in enumerate(reader, start=2):
        if i - 1 > MAX_ITEMS:
            break
        r = {(k or "").strip().lower(): v for k, v in row.items()}
        _add(out, i, r.get("content"), r.get("category"), r.get("tags"), default_category)
    return out


_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*$")
_BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$")
_HASHTAG = re.compile(r"(?:^|\s)#([\w\-一-鿿]+)")


def parse_markdown(data: str, default_category: str) -> Parsed:
    """每個條列項目為一筆記憶；標題若為分類名稱（如「## Preferences」「## 偏好」）會套用到其下項目；#tag 轉為標籤。"""
    out = Parsed()
    category = default_category
    for i, line in enumerate(data.splitlines(), start=1):
        if m := _HEADING.match(line.strip()):
            category = normalize_category(m.group(1), default_category) or default_category
            continue
        if m := _BULLET.match(line):
            text = m.group(1).strip()
            tags = _HASHTAG.findall(text)
            text = _HASHTAG.sub("", text).strip() if tags else text
            _add(out, i, text, category, tags, default_category)
        if len(out.items) >= MAX_ITEMS:
            break
    if not out.items and not out.errors:
        out.errors.append({"row": 0, "message": "找不到條列項目（- 或 1. 開頭的行）"})
    return out


def parse_text(data: str, default_category: str) -> Parsed:
    out = Parsed()
    for i, line in enumerate(data.splitlines(), start=1):
        if line.strip():
            _add(out, i, line, None, None, default_category)
        if len(out.items) >= MAX_ITEMS:
            break
    return out


def parse(fmt: str, raw: bytes, default_category: str = "knowledge") -> Parsed:
    try:
        data = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return Parsed(errors=[{"row": 0, "message": "檔案需為 UTF-8 編碼"}])
    return {"json": parse_json, "csv": parse_csv, "markdown": parse_markdown, "text": parse_text}[fmt](data, default_category)
