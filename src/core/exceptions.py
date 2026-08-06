from fastapi import HTTPException, status


class QuotaExceeded(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Суточный лимит загрузок исчерпан. Попробуйте завтра.",
        )
