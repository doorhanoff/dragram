from fastapi import HTTPException, status


class PostNotFound(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


class NotPostOwner(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Not the post owner")


class InvalidFileType(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST,
                         detail="Allowed types: jpeg, png, webp, gif, mp4, webm")
