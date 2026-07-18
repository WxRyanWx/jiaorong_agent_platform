# Version the machine protocol by compatible major

Every Jiaorong CLI machine-readable Headless Run will declare a Protocol Version in `init`, beginning with version 1. Within one major version, changes may only add optional fields or non-terminal events; consumers will ignore unknown optional fields and may skip unknown non-terminal events, while established required fields retain their meaning. Incompatible changes require a new major, and Workbuddian must reject unsupported majors before executing a task rather than attempting a best-effort parse.
