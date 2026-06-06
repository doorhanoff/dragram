# Alternative: Use bcrypt instead of argon2
# Faster (~100-200ms), simpler, still secure
# Uncomment and use if you prefer bcrypt over reduced argon2

from pwdlib import PasswordHash

# bcrypt with cost=10 (default, ~100-200ms on shared CPU)
pwd_context = PasswordHash.recommended_bcrypt()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

