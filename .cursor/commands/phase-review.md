// Phase 1: Review + Fix + QC Workflow Command (hardened version)

/**
 * Command: /phase-review
 *
 * Workflow:
 * 1) Run comprehensive review (official docs + best practices + issue context).
 * 2) Apply fixes from findings.
 * 3) Run independent QC against review criteria + original issue.
 * 4) Repeat until pass or max iteration limit.
 * 5) Close only when gates pass; otherwise request further fixes with concrete blockers.
 */

type Severity = "critical" | "high" | "medium" | "low";
type PhaseStatus = "closed" | "needs-fixes" | "failed";

interface ReviewFinding {
    id: string;
    severity: Severity;
    title: string;
    details: string;
    source: "officialDocs" | "bestPractices" | "codeContext";
    filePath?: string;
    line?: number;
}

interface ReviewSummary {
    summary: string;
    findings: ReviewFinding[];
}

interface FixResult {
    summary: string;
    resolvedFindingIds: string[];
    unresolvedFindingIds: string[];
    changedFiles: string[];
    testsRun: Array<{ name: string; status: "passed" | "failed" | "skipped" }>;
}

interface QCIssue {
    severity: Severity;
    title: string;
    details: string;
    findingId?: string;
}

interface QCReport {
    passed: boolean;
    score: number; // 0-100
    summary: string;
    issuesFound: QCIssue[];
}

interface PhaseReviewOptions {
    maxIterations?: number;
    minQcScore?: number;
    failOnCritical?: boolean;
    autoCloseOnPass?: boolean;
    dryRun?: boolean;
}

interface PhaseReviewResult {
    status: PhaseStatus;
    iterations: number;
    reviewHistory: ReviewSummary[];
    fixHistory: FixResult[];
    qcHistory: QCReport[];
    finalSummary: string;
}

const DEFAULT_OPTIONS: Required<PhaseReviewOptions> = {
    maxIterations: 2,
    minQcScore: 90,
    failOnCritical: true,
    autoCloseOnPass: true,
    dryRun: false
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function hasBlockingQcIssues(issues: QCIssue[], failOnCritical: boolean): boolean {
    for (const issue of issues) {
        if (issue.severity === "critical" && failOnCritical) {
            return true;
        }
        if (issue.severity === "high") {
            return true;
        }
    }
    return false;
}

function buildFixRequestFromQc(issues: QCIssue[]): string[] {
    return issues.map((issue) => `[${issue.severity.toUpperCase()}] ${issue.title}: ${issue.details}`);
}

async function safeAnnotate(issueId: string, note: string): Promise<void> {
    try {
        await annotateReview(issueId, note);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`annotateReview failed for ${issueId}: ${message}`);
    }
}

async function phaseReview(
    issueId: string,
    codeContext: string,
    options: PhaseReviewOptions = {}
): Promise<PhaseReviewResult> {
    if (!issueId || !codeContext) {
        throw new Error("phaseReview requires non-empty issueId and codeContext.");
    }

    const config: Required<PhaseReviewOptions> = {
        ...DEFAULT_OPTIONS,
        ...options,
        maxIterations: clamp(options.maxIterations ?? DEFAULT_OPTIONS.maxIterations, 1, 5),
        minQcScore: clamp(options.minQcScore ?? DEFAULT_OPTIONS.minQcScore, 1, 100)
    };

    const reviewHistory: ReviewSummary[] = [];
    const fixHistory: FixResult[] = [];
    const qcHistory: QCReport[] = [];

    let iteration = 0;

    try {
        while (iteration < config.maxIterations) {
            iteration += 1;
            await safeAnnotate(issueId, `Phase-review iteration ${iteration} started.`);

            const reviewSummary: ReviewSummary = await codeReviewer({
                issueId,
                codeContext,
                officialDocs: true,
                industryBestPractices: true,
                comprehensive: true,
                includeSeverity: true
            });
            reviewHistory.push(reviewSummary);
            await safeAnnotate(issueId, `Review iteration ${iteration}: ${reviewSummary.summary}`);

            const fixResult: FixResult = await fixIssue(issueId, reviewSummary, {
                enforceTests: true,
                preserveBehavior: true
            });
            fixHistory.push(fixResult);
            await safeAnnotate(issueId, `Fix iteration ${iteration}: ${fixResult.summary}`);

            const qcReport: QCReport = await qualityControlAgent({
                issueId,
                fixResult,
                originalReview: reviewSummary,
                codeContext,
                checkAgainst: ["officialDocs", "bestPractices", "initialIssue", "regressionRisk"],
                requireEvidence: true
            });
            qcHistory.push(qcReport);
            await safeAnnotate(issueId, `QC iteration ${iteration}: ${qcReport.summary}`);

            const blockingIssues = hasBlockingQcIssues(qcReport.issuesFound, config.failOnCritical);
            const passedGates = qcReport.passed && qcReport.score >= config.minQcScore && !blockingIssues;

            if (passedGates) {
                if (!config.dryRun && config.autoCloseOnPass) {
                    await closeIssue(issueId, qcReport.summary);
                }

                return {
                    status: "closed",
                    iterations: iteration,
                    reviewHistory,
                    fixHistory,
                    qcHistory,
                    finalSummary: `Issue closed after ${iteration} iteration(s).`
                };
            }

            const remediationItems = buildFixRequestFromQc(qcReport.issuesFound);
            if (!config.dryRun) {
                await requestFurtherFixes(issueId, remediationItems);
            }
        }

        return {
            status: "needs-fixes",
            iterations: iteration,
            reviewHistory,
            fixHistory,
            qcHistory,
            finalSummary: `Reached max iterations (${config.maxIterations}) without passing QC gates.`
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await safeAnnotate(issueId, `phaseReview failed: ${message}`);

        return {
            status: "failed",
            iterations: iteration,
            reviewHistory,
            fixHistory,
            qcHistory,
            finalSummary: `Workflow failed: ${message}`
        };
    }
}

/*
Helper functions expected in your command runtime:
- codeReviewer({ issueId, codeContext, officialDocs, industryBestPractices, comprehensive, includeSeverity })
- annotateReview(issueId, summaryOrNote)
- fixIssue(issueId, reviewSummary, options)
- qualityControlAgent({ issueId, fixResult, originalReview, codeContext, checkAgainst, requireEvidence })
- closeIssue(issueId, summary)
- requestFurtherFixes(issueId, issues)
*/
