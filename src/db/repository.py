from sqlalchemy.ext.asyncio import AsyncSession


class BaseRepository:
    """
    Общий предок репозиториев: хранит сессию и даёт явную границу транзакции.

    Сессия из get_async_session сама ничего не коммитит — за это отвечает
    сервисный слой, вызывая commit() в конце бизнес-операции. Правило простое:
    метод сервиса, который что-то пишет, заканчивается await self.repo.commit().

    Почему не автокоммит в самом генераторе сессий: в websocket-хендлере
    сессия из Depends живёт всё соединение, и автокоммит сработал бы только
    при отключении — сообщения не были бы видны другим участникам, терялись
    бы при обрыве связи, а соединение из пула удерживалось бы часами.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def commit(self) -> None:
        await self.session.commit()
