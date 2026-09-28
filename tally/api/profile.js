import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getAdminClient()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ profile: data })
  }

  if (req.method === 'PATCH') {
    const { display_name } = req.body || {}
    if (!display_name) return res.status(400).json({ error: 'display_name is required' })
    const { error } = await supabase.from('profiles').update({ display_name }).eq('id', user.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PATCH')
  return res.status(405).json({ error: 'Method not allowed' })
}
