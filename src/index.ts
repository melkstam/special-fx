import { Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'
import { requestId } from 'hono/request-id'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'

const currencySchema  = z.enum([
  'EUR',
'USD',
'JPY',
'BGN',
'CZK',
'DKK',
'GBP',
'HUF',
'PLN',
'RON',
'SEK',
'CHF',
'ISK',
'NOK',
'TRY',
'AUD',
'BRL',
'CAD',
'CNY',
'HKD',
'IDR',
'ILS',
'INR',
'KRW',
'MXN',
'MYR',
'NZD',
'PHP',
'SGD',
'THB',
'ZAR',
])

const app = new Hono()

app.use(prettyJSON())
app.use(requestId())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/:fromCurrency/latest',
  zValidator('param', z.object({
    fromCurrency: currencySchema,
  })),
  async (c) => {
    const { fromCurrency } = c.req.valid('param')

    // Dummy exchange rates for demonstration purposes
    return c.json({
      from: fromCurrency,
      rates: {
        EUR: 0.85,
        USD: 1.0,
        JPY: 110.0,
      },
      date: new Date().toISOString().split('T')[0],
    })
})

export default app
