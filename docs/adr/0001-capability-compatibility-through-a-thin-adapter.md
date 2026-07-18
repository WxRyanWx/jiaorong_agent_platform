# Prefer capability compatibility through a thin adapter

Jiaorong CLI will target behavioral and capability parity with the agent functions Workbuddian currently receives from CodeBuddy, rather than reproducing CodeBuddy's command flags, JSON fields, and event ordering byte for byte. A thin Jiaorong-specific transport adapter may be added when migration begins, so Workbuddian's user interface and core business flows remain unchanged while Jiaorong CLI retains ownership of its own protocol.
