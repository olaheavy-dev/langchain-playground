from app.agents.base import get_model


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
