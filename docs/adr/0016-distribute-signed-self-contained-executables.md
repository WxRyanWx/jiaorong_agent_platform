# Distribute signed self-contained executables

Jiaorong CLI will ship as signed, self-contained executables for each supported platform, installed at a stable path and exposed through `PATH` by an official installer or package channel. Workbuddian will resolve the command from `PATH` with an explicit absolute-path override; the CLI will expose version, doctor, and update capabilities, while global npm installation remains a developer option rather than the first-release user distribution path.
