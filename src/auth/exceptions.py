from fastapi import HTTPException, status


class InvalidTokenError(HTTPException):
    def __init__(self):
        # 401, а не 403: проблема с credentials, клиентские перехватчики
        # «обновить токен и повторить» реагируют именно на 401.
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Token")

class UserNotFoundError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

class UserAlreadyExistsError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail="User already exist")


class InvalidCredentials(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


class TooManyLoginAttempts(HTTPException):
    def __init__(self, retry_after: int):
        # Лимит по IP не мешает перебирать один номер с полусотни адресов,
        # поэтому неудачные попытки считаются ещё и по самому номеру.
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много неудачных попыток входа. Попробуйте позже.",
            headers={"Retry-After": str(retry_after)},
        )