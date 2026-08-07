"""Считает Argon2-хеши для двери перед сайтом.

Запуск (ответы вводятся вручную и нигде не сохраняются):
    uv run python deploy/make-gate-hashes.py

Выводит две строки для .env. Сами ответы в репозиторий не попадают и из
хешей не восстанавливаются — в этом весь смысл: заглянув в код, в образ или
в .env на сервере, правильные ответы узнать нельзя.
"""
import sys
from getpass import getpass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.gate.service import build_hashes, normalize_date, normalize_name  # noqa: E402


def main() -> None:
    # getpass, а не input: ответы не должны остаться в истории терминала
    # и не должны отсвечивать на экране.
    birthday = getpass("День рождения (например «16 августа»): ")
    creator = getpass("Имя создателя (ФИО): ")

    if not normalize_date(birthday):
        raise SystemExit("Дату разобрать не удалось. Нужен день и месяц: «16 августа» или «16.08».")
    if not normalize_name(creator):
        raise SystemExit("Имя пустое.")

    birthday_hash, creator_hash = build_hashes(birthday, creator)
    print("\nДобавьте в .env на сервере:\n")
    print(f"GATE_BIRTHDAY_HASH={birthday_hash}")
    print(f"GATE_CREATOR_HASH={creator_hash}")
    print("\nПосле этого перезапустите приложение:")
    print("  docker compose -f docker-compose.prod.yaml up -d app")


if __name__ == "__main__":
    main()
