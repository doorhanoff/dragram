from fastapi import HTTPException, status


class ProblemWithUploadingFiles(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Problem with uploading files")


class FileTooLarge(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="File size is too large")

