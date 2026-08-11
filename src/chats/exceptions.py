from fastapi import HTTPException, status


class ChatNotFound(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")


class NotChatMember(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")


class InvalidFileType(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Allowed: jpeg, png, webp")


class KeyTargetNotMember(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Key target is not a chat member")


class TooLargeSize(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="File size is too large")


class ForeignMediaUrl(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Media url does not belong to this service",
        )


class UnknownMember(HTTPException):
    def __init__(self):
        # 400, а не 500: несуществующий участник — это ошибка запроса, а не
        # сбой сервера (раньше сюда прилетало нарушение внешнего ключа).
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown chat member")


class CannotAddToPersonalChat(HTTPException):
    """В переписке двоих ключ выводится из пары их ключей (ECDH) — третий
    участник не смог бы расшифровать в ней ни одного сообщения, включая уже
    отправленные. Для нескольких человек заводится группа со своим ключом."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="В личную переписку добавить третьего нельзя — создайте группу.",
        )


class TooManyChatMembers(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="В группе слишком много участников.",
        )


class TooManyMessages(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много сообщений подряд.",
        )


class InvalidEvent(HTTPException):
    def __init__(self, detail: str = "Malformed event"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
