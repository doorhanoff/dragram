from fastapi import HTTPException, status


class AlbumNotFound(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")


class NotAlbumMember(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")


class NotAlbumOwner(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail="Not the album owner")


class CannotRemoveOwner(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST,
                         detail="Album creator cannot be removed")


class InvalidFileType(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST,
                         detail="Allowed types: jpeg, png, webp, gif, mp4, webm")
