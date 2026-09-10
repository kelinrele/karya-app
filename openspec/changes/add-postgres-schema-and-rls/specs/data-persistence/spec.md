## Purpose

Durable per-user storage for tasks, their substeps, captured ideas, and daily
completion history, so a signed-in user sees the same data on every device and
no user can observe or alter another user's records.

## ADDED Requirements

### Requirement: Personal records are private to their owner

Every task, idea, and daily completion record SHALL be readable, writable, and
deletable only by the user who owns it. A caller without a valid session SHALL
observe no personal records at all. Access control SHALL be enforced by the
database rather than by the client, because the public API key is distributed
in the browser bundle and cannot be treated as a secret.

#### Scenario: An anonymous caller queries tasks

- **WHEN** a request carrying no user session asks for tasks
- **THEN** the response SHALL contain no records
- **AND** the request SHALL NOT reveal whether any records exist

#### Scenario: A signed-in user queries another user's task by its identifier

- **WHEN** user A requests a task owned by user B, addressing it directly by
  its identifier
- **THEN** the response SHALL contain no records
- **AND** the response SHALL be indistinguishable from one for a task that
  does not exist

#### Scenario: A user attempts to create a record owned by someone else

- **WHEN** user A submits a task naming user B as the owner
- **THEN** the write SHALL be refused
- **AND** no record SHALL be created

#### Scenario: A user attempts to modify or remove another user's task

- **WHEN** user A submits an update or a deletion targeting user B's task
- **THEN** no record SHALL be changed or removed
- **AND** user B's task SHALL remain exactly as it was

### Requirement: A task is scheduled exactly one way

A task SHALL be scheduled either by a due date, optionally with a time of day,
or by a period with a beginning and an end, and never by both or neither. A
period SHALL end after it begins. The database SHALL refuse any task violating
this, so no client can persist a task whose schedule is uninterpretable.

#### Scenario: A task is given both a due date and a period

- **WHEN** a task is submitted carrying both a due date and a beginning and
  ending time
- **THEN** the write SHALL be refused

#### Scenario: A period task is missing its end

- **WHEN** a task is submitted as a period with a beginning but no end
- **THEN** the write SHALL be refused

#### Scenario: A period ends before it begins

- **WHEN** a task is submitted whose ending time precedes its beginning time
- **THEN** the write SHALL be refused

#### Scenario: A task is created with no date at all

- **WHEN** a task is submitted with neither a due date nor a period
- **THEN** the write SHALL succeed
- **AND** the task SHALL be treated as unscheduled rather than overdue

### Requirement: Completion time is maintained by the system

When a task becomes complete the system SHALL record the moment it happened.
When a task is reopened the system SHALL clear that moment. Clients SHALL NOT
be trusted to supply it, so that completion history cannot be backdated by a
caller and cannot drift out of step with the completion flag.

#### Scenario: A task is marked complete

- **WHEN** a task's completion flag changes from incomplete to complete
- **THEN** its completion time SHALL be set to the current time

#### Scenario: A completed task is reopened

- **WHEN** a task's completion flag changes from complete to incomplete
- **THEN** its completion time SHALL be cleared

#### Scenario: A client supplies its own completion time

- **WHEN** a caller submits a completion time alongside the completion flag
- **THEN** the stored completion time SHALL be the one the system determined

### Requirement: Tasks carry ordered substeps

A task SHALL be able to hold a list of substeps, each with text and a
completion state, retrieved together with the task in a single read. Substeps
SHALL preserve the order in which they were defined.

#### Scenario: A task with substeps is read

- **WHEN** a task holding substeps is retrieved
- **THEN** its substeps SHALL be present in the same response
- **AND** they SHALL appear in their original order

#### Scenario: A task is created without substeps

- **WHEN** a task is created with no substeps given
- **THEN** it SHALL hold an empty list rather than an absent one

### Requirement: Ideas are captured and promoted

A user SHALL be able to record a short idea without supplying a date, priority,
or any other detail, and later promote it into a task. Promotion SHALL leave no
duplicate behind.

#### Scenario: An idea is captured with only text

- **WHEN** a user submits an idea consisting of text alone
- **THEN** it SHALL be stored and returned in that user's idea list

#### Scenario: An empty idea is submitted

- **WHEN** a user submits an idea whose text is empty or only whitespace
- **THEN** the write SHALL be refused

### Requirement: Daily completion history is append-only

The system SHALL keep at most one completion record per user per day, and that
history SHALL NOT be deletable through the public interface. Streak length
SHALL be derived from this history rather than stored, so it cannot disagree
with the records it summarises.

#### Scenario: A user attempts to delete their completion history

- **WHEN** a user submits a deletion against their own completion records
- **THEN** no record SHALL be removed

#### Scenario: A second completion record is written for the same day

- **WHEN** a completion record is written for a day that already has one
- **THEN** the existing record SHALL be updated rather than duplicated

#### Scenario: A day is missed

- **WHEN** a user completes tasks, records nothing the following day, then
  completes tasks again
- **THEN** the derived streak SHALL count only the most recent unbroken run

### Requirement: Deleting an account removes its data

When a user account is removed, every task, substep, idea, completion record,
and group the user owns SHALL be removed with it, leaving no orphaned rows.

#### Scenario: An account is deleted

- **WHEN** a user account is removed
- **THEN** no personal records belonging to that user SHALL remain
