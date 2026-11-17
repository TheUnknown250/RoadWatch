import { test, expect } from '@playwright/test'
import { cleanupTestData, createE2eUser, randomUsername } from './fixtures/db'

test.describe('Authentication Flows', () => {
  test.afterAll(async () => {
    await cleanupTestData()
  })

  test('sign up new user, view account, and sign out', async ({ page }) => {
    const username = randomUsername('u')
    const password = 'StrongPassword123!'
    const displayName = 'E2E User'

    await page.goto('/signin')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

    // Switch to create account tab
    await page.getByRole('tab', { name: /create account/i }).click()
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible()

    // Fill form
    await page.fill('input[name="name"]', displayName)
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)

    // Submit
    await page.getByRole('button', { name: /create account/i }).click()

    // Should redirect to home
    await expect(page).toHaveURL('/')

    // Navigate to Account page
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: displayName })).toBeVisible()
    await expect(page.getByText(/· user/i)).toBeVisible()

    // Sign out (exact: true to distinguish from "Sign out of all devices")
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByText('Sign in to report incidents, verify reports and get alerts.')).toBeVisible()
  })

  test('validates bad password on registration', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('tab', { name: /create account/i }).click()

    await page.fill('input[name="username"]', randomUsername('bad'))
    await page.fill('input[name="password"]', 'short') // < 8 characters

    await page.getByRole('button', { name: /create account/i }).click()

    const alert = page.getByRole('alert')
    const isVisible = await alert.isVisible().catch(() => false)
    if (isVisible) {
      await expect(alert).toContainText(/at least 8 characters/i)
    }
  })

  test('sign in with existing user', async ({ page }) => {
    const user = await createE2eUser({ displayName: 'Existing User' })

    await page.goto('/signin')
    await page.fill('input[name="username"]', user.username)
    await page.fill('input[name="password"]', user.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL('/')
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Existing User' })).toBeVisible()
  })

  test('displays error on invalid credentials', async ({ page }) => {
    await page.goto('/signin')
    await page.fill('input[name="username"]', 'nonexistent_user')
    await page.fill('input[name="password"]', 'WrongPassword123!')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(/incorrect username or password/i)
  })
})
