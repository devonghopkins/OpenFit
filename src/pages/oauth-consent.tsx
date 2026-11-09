import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dumbbell, Loader2, ShieldCheck } from 'lucide-react'

type Details = {
  authorization_id: string
  client: { name: string; uri: string }
  user: { email: string }
  scope: string
}

/**
 * Supabase's OAuth server sends people here (Authorization Path) when an app such
 * as Claude asks to connect to their OpenFit account. Approving sends them back to
 * the app with an authorization code.
 */
export default function OAuthConsentPage() {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(authorizationId ? null : 'This link is missing its authorization request.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (error || !data) return setError(error?.message ?? 'Could not load this request.')
      // Already approved before: go straight back to the app
      if (!('authorization_id' in data)) return window.location.assign(data.redirect_url)
      setDetails(data as Details)
    })
  }, [authorizationId])

  const decide = async (approve: boolean) => {
    if (!authorizationId) return
    setBusy(true)
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (error || !data) {
      setBusy(false)
      return setError(error?.message ?? 'Something went wrong.')
    }
    window.location.assign(data.redirect_url)
  }

  const appName = details?.client.name || 'An app'

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Dumbbell className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">OpenFit</h1>
        </div>

        <Card>
          <CardContent className="space-y-5 p-5">
            {error ? (
              <p className="text-sm text-volume-danger">{error}</p>
            ) : !details ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold leading-snug">Allow {appName} to access your OpenFit account?</h2>
                  {details.client.uri && (
                    <p className="text-xs text-muted-foreground break-all">{details.client.uri}</p>
                  )}
                </div>
                <div className="flex gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-volume-safe" />
                  <p>
                    It will be able to read your programs, workouts and goals, and change your program
                    (swap, add or remove exercises, change sets) when you ask it to.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Signed in as {details.user.email}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" disabled={busy} onClick={() => decide(false)}>Deny</Button>
                  <Button className="h-11" disabled={busy} onClick={() => decide(true)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Allow'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
