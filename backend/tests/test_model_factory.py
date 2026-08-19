from app.agents.base import get_embeddings, get_model


def test_the_api_key_is_passed_explicitly() -> None:
    """pydantic-settings reads .env into the Settings object but does not export
    it to os.environ, where LangChain would otherwise look. Passing the key
    explicitly is what stops every request failing on credentials."""
    model = get_model(temperature=0.3)

    assert model.openai_api_key.get_secret_value() == 'test-key-not-used'  # pyright: ignore[reportAttributeAccessIssue]


def test_the_model_is_built_once_per_temperature() -> None:
    """The factory is cached, so the three agents share one client rather than
    opening a connection pool each."""
    assert get_model(temperature=0.3) is get_model(temperature=0.3)
    assert get_model(temperature=0.3) is not get_model(temperature=0.1)


def test_the_embedding_key_is_passed_explicitly_too() -> None:
    """The same trap as the chat model, and the reason both clients are built
    here: a client constructed anywhere else picks up no key and fails with
    "Missing credentials", which reads as a bad key rather than as settings
    that never reached the environment."""
    embeddings = get_embeddings()

    assert embeddings.openai_api_key.get_secret_value() == 'test-key-not-used'  # pyright: ignore[reportAttributeAccessIssue]


def test_the_embedding_model_is_built_once() -> None:
    assert get_embeddings() is get_embeddings()
