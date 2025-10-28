import { Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'

const app = new Hono()

app.use(prettyJSON())
app.use(requestId())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
