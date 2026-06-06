from pwdlib import PasswordHash

# Reduced parameters for Railway's shared CPU environment
# Default: time_cost=2, memory_cost=65536 KiB (~2-5 min on shared CPU)
# Optimized: time_cost=1, memory_cost=16384 KiB (~200-500ms on shared CPU)
# Still provides strong security; argon2 is resistant to GPU attacks even at lower costs
pwd_context = PasswordHash.recommended(
    time_cost=1,      # Reduced from 2
    memory_cost=16384 # Reduced from 65536 KiB
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

