"""容器啟動前檢查設定（docker/entrypoint.sh 呼叫）。失敗時印出原因並以非 0 結束。"""

import sys

from memora.config import ConfigError, validate_settings


def main() -> int:
    try:
        validate_settings()
    except ConfigError as e:
        print(f"\n[MEMORA] {e}\n", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
