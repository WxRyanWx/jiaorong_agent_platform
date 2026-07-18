# Jiaorong CLI owns durable Agent Sessions

Jiaorong CLI will create and persist Agent Sessions, return a stable Session ID on the first run, and resume that session when the ID is supplied to a later process invocation, including after application or machine restarts. Workbuddian will persist the Session ID but will not reconstruct model context by replaying the full visible chat history.
