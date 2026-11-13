"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  confirmRequest,
  proposeRequest,
  type DecisionInput,
} from "@/app/actions/requests";
import type { Proposal } from "@/lib/intake";
import { confidenceTone } from "@/lib/tones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Step =
  | { name: "edit" }
  | { name: "match"; proposal: Proposal }
  | { name: "new"; proposal: Proposal };

/** Two-step submit flow: propose (AI matching, saves nothing), then confirm. */
export function SubmitRequestForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState<Step>({ name: "edit" });
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = { title, description };

  function propose() {
    setError(null);
    startTransition(async () => {
      const result = await proposeRequest(draft);
      if (!result.ok) {
        setError({ message: result.error, retry: propose });
        return;
      }
      const { proposal } = result;
      setStep(proposal.match ? { name: "match", proposal } : { name: "new", proposal });
    });
  }

  function confirm(proposal: Proposal, decision: DecisionInput) {
    const run = () => {
      setError(null);
      startTransition(async () => {
        const result = await confirmRequest(draft, proposal, decision);
        if (!result.ok) {
          setError({ message: result.error, retry: run });
          return;
        }
        router.push(`/problems/${result.problemId}`);
      });
    };
    run();
  }

  const errorBox = error && (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      <span>
        <strong>That didn&apos;t work.</strong> {error.message}
      </span>
      <Button size="sm" variant="outline" onClick={error.retry} disabled={pending}>
        Retry
      </Button>
    </div>
  );

  if (step.name === "edit") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          propose();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Remember my grinder setting for each brew"
            required
            maxLength={200}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you trying to do, and what gets in the way?"
            required
            maxLength={5000}
            rows={6}
            disabled={pending}
          />
        </div>
        {errorBox}
        <Button type="submit" disabled={pending || !title.trim() || !description.trim()}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Checking for matching Problems…
            </>
          ) : (
            "Continue"
          )}
        </Button>
        {pending && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            The AI is comparing your Request with existing Problems. This can take a few
            seconds.
          </p>
        )}
      </form>
    );
  }

  const { proposal } = step;
  const backToEdit = (
    <Button variant="ghost" onClick={() => setStep({ name: "edit" })} disabled={pending}>
      Edit my Request
    </Button>
  );
  const spinner = pending && <Loader2 className="animate-spin" />;

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardDescription>Your Request</CardDescription>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
          {description}
        </CardContent>
      </Card>

      {step.name === "match" && proposal.match ? (
        <Card>
          <CardHeader>
            <CardDescription>
              This looks like an existing Problem{" "}
              <Badge tone={confidenceTone(proposal.match.confidence)}>
                {Math.round(proposal.match.confidence * 100)}% confident
              </Badge>
            </CardDescription>
            <CardTitle>{proposal.match.problemTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{proposal.match.reason}</CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              onClick={() => confirm(proposal, { attachTo: proposal.match!.problemId })}
              disabled={pending}
            >
              {spinner} Yes, add my Request and Support
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep({ name: "new", proposal })}
              disabled={pending}
            >
              Mine is different
            </Button>
            {backToEdit}
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>
              {proposal.match
                ? "Got it, yours is different. We'll create a new Problem:"
                : "No existing Problem matches. We'll create a new Problem:"}
            </CardDescription>
            <CardTitle>{proposal.newProblem.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{proposal.newProblem.need}</CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              onClick={() => confirm(proposal, { createProblem: proposal.newProblem })}
              disabled={pending}
            >
              {spinner} Create Problem and add my Support
            </Button>
            {proposal.match && (
              <Button
                variant="outline"
                onClick={() => setStep({ name: "match", proposal })}
                disabled={pending}
              >
                Back to the suggested match
              </Button>
            )}
            {backToEdit}
          </CardFooter>
        </Card>
      )}
      {errorBox}
    </div>
  );
}
