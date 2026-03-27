## 2025-02-13 - Added missing for attributes to auth forms
**Learning:** Found that auth forms lacked `for` attributes on labels associating them with input IDs, breaking keyboard navigation and screen reader support.
**Action:** Always ensure `<label>` tags explicitly link to inputs using `for="id"`, especially in forms where users expect to click the label text to focus the input.
