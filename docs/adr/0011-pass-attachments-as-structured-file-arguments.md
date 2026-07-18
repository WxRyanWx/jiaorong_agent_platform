# Pass attachments as structured file arguments

Jiaorong CLI will accept Attachments through a repeatable `--file` argument instead of requiring consumers to interpolate paths into prompts. It will validate real paths, symbolic links, existence, access boundaries, and size limits; the first release will support text files and common images, reject unsupported types explicitly, and report accepted attachment metadata in `init` without embedding raw binary data in the JSONL stream.
