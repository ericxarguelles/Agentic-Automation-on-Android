# Compact observation change

Experiment: `s23-gpt6-message-01`. Candidate change for the next iteration;
no faster outcome has been measured and no root cause is established.

One intervention: reduce repeated screen text sent to the assistant, to reduce
the input it needs to process between phone actions.

The default observation now excludes a visible-text entry only when it exactly
matches an action label actually returned in that same response. Read `actions`
and `visible_text` together. Unique text, delivery status, and text longer than a
truncated action label remain available. Labels beyond the action limit do not
cause text removal. When actions are unavailable, text is retained. Detailed
observations retain their previous text behavior.

No actions are skipped or automated by this change. Snapshot validation, action
IDs, wait durations, recipient/draft verification, and Send behavior are unchanged.
Deploy/restart the updated server before measuring the next trial; editing source
does not update an already running process. No phone message was sent to test this.

Compare repeated trials against baseline using the same task procedure. Record
the change as "Remove exact duplicate screen text from compact observations."
Do not label the unobserved timing bucket as model inference or claim that this
change resolves all between-call delay.
