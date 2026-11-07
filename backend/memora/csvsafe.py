"""CSV 輸出：防止公式注入（CSV / Formula Injection）。

以 = + - @ 或 Tab / CR 開頭的儲存格，在 Excel、Numbers、Google Sheets 中可能被當成公式執行。
記憶內容可能來自 AI 或匯入檔，因此所有使用者資料欄位一律加上前置單引號。
"""

import csv
import io
from collections.abc import Iterable
from typing import Any

_DANGEROUS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(_DANGEROUS):
        return "'" + value
    return value


def to_csv(header: list[str], rows: Iterable[Iterable[Any]]) -> str:
    """回傳含 UTF-8 BOM 的 CSV（Excel 正確顯示中文）。"""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for row in rows:
        w.writerow([safe_cell(v) for v in row])
    return "﻿" + buf.getvalue()
