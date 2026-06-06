from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

# rounds=10 вместо recommended (12+) — достаточно безопасно, в 4x быстрее
pwd_context = PasswordHash((BcryptHasher(rounds=10),))


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)
