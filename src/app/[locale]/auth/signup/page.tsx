'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from 'next-intl'
import Navbar from "@/components/Navbar"
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function SignUp() {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const router = useRouter()
  const t = useTranslations('auth')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError(t('passwordTooShort'))
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          password,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(t('signupSuccess'))
        setTimeout(() => {
          router.push("/auth/signin")
        }, 2000)
      } else {
        setError(data.message || t('signupFailed'))
      }
    } catch {
      setError(t('signupError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full">
          <Card className="w-full rounded-2xl">
            <CardContent className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {t('createAccount')}
              </h1>
              <p className="text-muted-foreground">{t('joinPlatform')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
                  {t('phoneNumber')}
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11"
                  placeholder={t('phoneNumberPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">
                  {t('password')}
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                  placeholder={t('passwordMinPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-foreground">
                  {t('confirmPassword')}
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11"
                  placeholder={t('confirmPasswordPlaceholder')}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm text-emerald-700">
                  {success}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full font-semibold"
              >
                {loading ? t('signupButtonLoading') : t('signupButton')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                {t('hasAccount')}{" "}
                <Link href="/auth/signin" className="font-medium text-primary hover:underline">
                  {t('signinNow')}
                </Link>
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                {t('backToHome')}
              </Link>
            </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
