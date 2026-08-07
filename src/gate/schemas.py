from pydantic import BaseModel, Field


class UnlockBody(BaseModel):
    # Ограничения на длину — чтобы в Argon2 не улетала мегабайтная строка:
    # хеширование намеренно медленное, и это был бы способ занять процессор.
    birthday: str = Field(min_length=1, max_length=100)
    creator: str = Field(min_length=1, max_length=200)


class GateStatus(BaseModel):
    enabled: bool
    unlocked: bool
