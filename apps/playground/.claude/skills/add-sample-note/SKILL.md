---
name: add-sample-note
description: Add a sample note to the playground's notes through the telefactor MCP server
---

Add a note to the playground by calling the `addNote` tool of the `telefactor` MCP server, with the text given as this skill's argument, or `Added by the agent` when none is given. Then read the state with the server's `get_state` tool and report the number of notes that it contains.
