# 接口约定

## 1. 本次目标

网页输入一个 main.cpp 程序，点击运行，后端在沙箱中编译执行，
网页显示输出或错误。

本项目提供健康检查、编译运行、提交历史和课堂题目接口。
接口由后端负责人 B 维护，修改前与相关成员确认。

## 2. 通用约定

- 请求和响应使用 UTF-8 编码。
- JSON 请求和响应的 Content-Type 为 application/json。
- 字段名区分大小写，例如 exitCode 不能写成 exitcode。
- 学生代码的编译、运行必须在受限制的沙箱中完成。

## 3. 健康检查

### 请求

GET /api/ping

不需要请求体。

### 成功响应

HTTP 200

```json
{
  "ok": true
}
```

用于确认后端接口能够响应，不代表沙箱执行功能已经正常。

## 4. 编译运行

### 请求

POST /api/run

```json
{
  "files": [
    {
      "name": "main.cpp",
      "content": "#include <iostream>\nint main() { std::cout << \"Hello\\n\"; return 0; }\n"
    }
  ],
  "stdin": ""
}
```

### 请求字段

| 字段 | 类型 | 含义 |
|---|---|---|
| files | 数组 | 本次要编译的源文件 |
| files[].name | 字符串 | 文件名 |
| files[].content | 字符串 | 文件内容 |
| stdin | 字符串 | 程序的标准输入，不需要输入时传空字符串 |

### 输入限制

- 首次联调只发送一个名为 main.cpp 的文件。
- 文件数最多 10 个。
- 单个源文件内容最多 100 KB。
- 所有源文件内容合计最多 500 KB。
- 大小按 UTF-8 编码后的字节数计算；本接口约定 1 KB = 1000 字节。
- 文件名只能使用英文字母、数字、点、下划线和连字符。
- 文件名不能是 . 或 ..，不能重复，不能包含路径分隔符。
- 编译超时上限 10 秒，运行超时上限 2 秒。
- 执行器还须限制内存、输出和并发，并在异常时清理资源。

### 成功运行的响应示例

HTTP 200

```json
{
  "stdout": "Hello\n",
  "stderr": "",
  "exitCode": 0,
  "time": 123,
  "stage": "run"
}
```

### 响应字段

| 字段 | 类型 | 含义 |
|---|---|---|
| stdout | 字符串 | 程序的标准输出 |
| stderr | 字符串 | 编译错误、运行错误或超时说明 |
| exitCode | 整数 | 执行结果；0 表示成功，非 0 表示失败 |
| time | 数值 | 编译和运行的合计墙钟耗时，单位毫秒，不含排队时间 |
| stage | 字符串 | compile 或 run，表示任务结束时所在阶段 |

### 编译或运行失败

- 编译失败：stage 为 compile，exitCode 非 0。
- 编译成功后进入运行：stage 为 run。
- 编译或运行超时：exitCode 为 124，stderr 说明超时阶段。
- 学生程序编译失败、崩溃或超时，仍返回 HTTP 200 和上述结果结构。
- 前端结合 stage 和 exitCode 判断执行是否成功，
  不能只看 HTTP 200。

## 5. 请求错误和平台错误

请求不符合要求时返回 HTTP 400。
后端自身出现异常时返回 HTTP 500。

错误响应格式：

```json
{
  "error": "no_files",
  "message": "请至少提供一个源文件"
}
```

| HTTP 状态码 | error | 含义 |
|---|---|---|
| 400 | bad_request | JSON 格式、字段类型或必填字段错误 |
| 400 | no_files | 文件数组为空 |
| 400 | too_many_files | 文件数量超限 |
| 400 | file_too_large | 单个文件过大 |
| 400 | total_too_large | 文件总大小超限 |
| 400 | bad_filename | 文件名不合法或重复 |
| 500 | internal | 平台内部异常 |

平台错误响应不返回服务器密码、内部路径或完整异常堆栈。
详细异常写入服务器日志。

## 6. 第一次联调的检查项目

- GET /api/ping 返回 {"ok": true}。
- 提交示例程序，网页显示 Hello。
- 提交有语法错误的程序，网页显示编译错误。
- 提交无限循环程序，网页显示运行超时。
- 不论任务成功、失败或超时，都清理容器和临时文件。

## 7. 提交历史

运行接口取得编译或运行结果后，会尝试保存本次提交的源文件、标准输入和结果。编译失败也会保存。历史保存失败时，运行接口仍返回已取得的结果。

历史按浏览器 Cookie `online_lab_history` 区分，每个标识保留最近 20 条。

### 历史列表

`GET /api/history`

返回 HTTP 200，响应的 `items` 数组按时间从新到旧排列。每条摘要包含 `id`、`createdAt`、`fileNames`、`stage`、`exitCode` 和 `time`。没有记录时返回 `{"items":[]}`。`createdAt` 为 UTC 时间，`time` 为执行耗时，单位毫秒。

### 历史详情

`GET /api/history/<record_id>`

返回 HTTP 200，包含 `id`、`createdAt`、`files`、`stdin` 和 `result`。`files` 是本次提交的文件快照，每项含 `name` 和 `content`。`result` 使用第 4 节的运行结果结构。

找不到该记录或当前浏览器无法访问该记录时返回 HTTP 404。读取存储失败时返回 HTTP 500。

## 8. 课堂题目与教师发布

| 请求 | 网页上的操作 | 成功响应 |
| --- | --- | --- |
| `POST /api/teacher/form` | 教师验证口令，打开发题表单 | HTTP 200，返回表单 HTML |
| `POST /api/problems` | 教师填写题目后点击发布 | HTTP 201，返回保存后的题目 |
| `GET /api/problems` | 学生打开「课堂题目」或刷新列表 | HTTP 200，返回题目摘要列表 |
| `GET /api/problems/<problem_id>` | 学生选中一道题 | HTTP 200，返回题目说明和公开用例 |

### 教师口令

取表单和发布题目都要在请求头 `Authorization` 中带上教师口令。后端用服务配置中的 `ONLINE_LAB_TEACHER_TOKEN` 核对。下面的 `<教师发布口令>` 代表教师当次输入的值。学生读取列表和详情可以直接访问。

### 取发题表单

教师在 `/teacher/` 点「验证并进入发题页」时发送请求。这一步只需要口令，请求体可以为空。

```http
POST /api/teacher/form
Authorization: Bearer <教师发布口令>
```

口令正确时返回 HTTP 200。JSON 的 `html` 字段是完整的发题表单，浏览器把它显示在教师页上。下面只展示响应结构。

```json
{"html":"<h2>发布课堂题目</h2>..."}
```

响应带 `Cache-Control: no-store`，表示浏览器不应缓存这份表单。提交题目时会再核对一次口令。

### 发布题目

教师填写发题表单后，网页把口令和题目内容一起发给后端。口令在请求头，题目字段在 JSON 请求体。

```http
POST /api/problems
Authorization: Bearer <教师发布口令>
Content-Type: application/json
```

用「两数相加」作请求示例。

```json
{
  "title": "两数相加",
  "description": "输入两个整数，输出它们的和。",
  "cases": [
    {"stdin": "3 5", "expectedOutput": "8"}
  ]
}
```

| 字段 | 类型与限制 |
| --- | --- |
| `title` | 题目标题。必须是非空文本，最多 480 字节。 |
| `description` | 题目说明。必须是非空文本，最多 16000 字节。 |
| `cases` | 公开用例列表，必须有 1 到 10 组。 |
| `cases[].stdin` | 用例输入。必须提供字符串，允许空字符串，最多 16000 字节。 |
| `cases[].expectedOutput` | 预期输出。必须提供字符串，允许空字符串，最多 16000 字节。 |

长度按 UTF-8 编码后的字节数计算。标题和说明只有空白时会被拒绝，保存前会去掉首尾空白。用例输入与预期输出保留原有的空格和换行。

成功保存后返回 HTTP 201 和完整题目。后端生成 `id` 和 `createdAt`，示例中的编号和时间仅用于说明。`id` 是 32 位小写十六进制字符，`createdAt` 使用 UTC 时间。

```json
{
  "id": "1234567890abcdef1234567890abcdef",
  "createdAt": "2026-11-21T08:00:00+00:00",
  "title": "两数相加",
  "description": "输入两个整数，输出它们的和。",
  "cases": [
    {"stdin": "3 5", "expectedOutput": "8"}
  ]
}
```

### 读题目列表

`GET /api/problems` 直接读取已发布题目的摘要，返回 HTTP 200。`items` 按发布时间从新到旧排列，每项只有 `id`、`title` 和 `createdAt`。暂无题目时返回 `{"items":[]}`。列表响应带 `Cache-Control: no-store`，刷新时可以重新读取。

```json
{
  "items": [
    {
      "id": "1234567890abcdef1234567890abcdef",
      "title": "两数相加",
      "createdAt": "2026-11-21T08:00:00+00:00"
    }
  ]
}
```

### 读题目详情

`GET /api/problems/<problem_id>` 使用列表中拿到的 `id` 读完整题目。找到时返回 HTTP 200，JSON 字段与发布成功的响应相同。学生可以展示说明和公开用例，把 `stdin` 填入运行区。实际试跑仍使用原来的 `POST /api/run`。

### 常见失败响应

错误 JSON 包含 `error` 和 `message`。教师接口先核对口令，发布接口再检查题目内容。

| HTTP 状态码 | `error` | 出现的情况 |
| --- | --- | --- |
| 400 | `bad_request` | 发布请求的 JSON 无效，或标题、说明、用例不合要求。 |
| 401 | `unauthorized` | 取表单或发布时缺少口令，或所填口令不正确。 |
| 404 | `not_found` | 读取题目详情时，题号格式无效或找不到对应题目。 |
| 413 | `bad_request` | 请求体过大并由 Flask 拒绝时。 |
| 503 | `unavailable` | 取表单或发布时，后端未配置教师发布口令。 |
