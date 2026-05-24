import Link from 'next/link';
import { ExternalLink, Bike, Smartphone, Monitor, Wrench } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function StravaGearHelpPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-4xl px-4 py-10 space-y-6">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">Help</p>
          <h1 className="text-3xl font-bold tracking-tight">Add Bikes to Strava Gear</h1>
          <p className="text-muted-foreground">
            Quick guide for adding bikes in Strava and assigning them to activities.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Official Strava Docs</CardTitle>
            <CardDescription>
              This page summarizes Strava support guidance and links to the full article.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <a
              href="https://support.strava.com/hc/en-us/articles/216918727-Adding-Gear-to-Your-Activities-on-Strava"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              Read: Adding Gear to Your Activities on Strava
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href="https://www.strava.com/settings/gear"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              Open My Gear settings
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                On Strava Website
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open your Strava profile menu, then go to Settings.</li>
                <li>Select My Gear.</li>
                <li>Choose Add Bike.</li>
                <li>Enter nickname, bike type, and weight.</li>
                <li>Save, then set default sports if needed.</li>
              </ol>
            </CardContent>
          </Card>

          <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                On Strava Mobile App
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <ol className="list-decimal pl-5 space-y-1">
                <li>Open You tab, then Profile &gt; Gear.</li>
                <li>Tap the plus icon.</li>
                <li>Select Bike.</li>
                <li>Enter nickname, brand, model, and bike type.</li>
                <li>Save, then edit default sports if needed.</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bike className="h-5 w-5" />
              Assign Bike to an Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open the activity you want to edit.</li>
              <li>Select Edit Activity.</li>
              <li>Choose the correct bike from the gear dropdown.</li>
              <li>Save the activity.</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-card dark:bg-slate-800/80 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Common Fixes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>If retired gear keeps being applied, set a new default bike.</li>
              <li>If mileage looks off, update gear assignment on older activities.</li>
              <li>Bike component management is available on the Strava website.</li>
            </ul>
            <div className="pt-2">
              <Link href="/" className="text-primary hover:underline">
                Return to dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
