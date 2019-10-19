import BtpPlugin from 'ilp-plugin-btp'

const client = new BtpPlugin({
  server: 'btp+ws://:shh_its_a_secret@localhost:8080'
})

client.connect()
