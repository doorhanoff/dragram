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