"""簡易固定視窗限流（單一程序、記憶體內）。

自架單機部署足夠；若改成多個 API worker，需換成 Redis 等共用儲存。
"""

import threading
import time


class RateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[int, int]] = {}

    def hit(self, key: str) -> tuple[bool, int]:
        """回傳 (是否允許, 距離視窗重置秒數)。"""
        if self.per_minute <= 0:
            return True, 0
        now = int(time.time())
        window = now // 60
        with self._lock:
            w, count = self._windows.get(key, (window, 0))
            if w != window:
                w, count = window, 0
            count += 1
            self._windows[key] = (w, count)
            if len(self._windows) > 10_000:  # 避免無限成長
                self._windows = {k: v for k, v in self._windows.items() if v[0] == window}
        return count <= self.per_minute, 60 - now % 60


class LoginThrottle:
    """登入失敗節流：同一 IP 或同一帳號在 window 秒內失敗超過 max_failures 次即暫時封鎖。

    成功登入會清除該帳號與 IP 的失敗紀錄。單一程序、記憶體內（自架單機足夠）。
    """

    def __init__(self, max_failures: int = 10, window_s: int = 300):
        self.max_failures = max_failures
        self.window_s = window_s
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _recent(self, key: str, now: float) -> list[float]:
        hits = [t for t in self._failures.get(key, []) if now - t < self.window_s]
        if hits:
            self._failures[key] = hits
        else:
            self._failures.pop(key, None)
        return hits

    def blocked(self, *keys: str) -> int:
        """回傳需等待的秒數（0 = 未封鎖）。"""
        if self.max_failures <= 0:
            return 0
        now = time.time()
        with self._lock:
            wait = 0
            for k in keys:
                hits = self._recent(k, now)
                if len(hits) >= self.max_failures:
                    wait = max(wait, int(self.window_s - (now - hits[-self.max_failures])) + 1)
            return wait

    def fail(self, *keys: str) -> None:
        now = time.time()
        with self._lock:
            for k in keys:
                self._failures.setdefault(k, []).append(now)
            if len(self._failures) > 10_000:
                self._failures = {k: v for k, v in self._failures.items() if v and now - v[-1] < self.window_s}

    def reset(self, *keys: str) -> None:
        with self._lock:
            for k in keys:
                self._failures.pop(k, None)
