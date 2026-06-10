from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

pwd_context = PasswordHasher(
    time_cost=1,       # Reduced from default 2
    memory_cost=16384, # Reduced from default 65536 KiB
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        pwd_context.verify(hashed, password)
        return True
    except VerifyMismatchError:
        return False
