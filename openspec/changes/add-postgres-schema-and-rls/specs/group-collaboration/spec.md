## Purpose

Shared task lists that several people work on together, where membership is
granted by redeeming a code, every member sees changes as they happen, and a
non-member can observe nothing about a group at all.

## ADDED Requirements

### Requirement: Groups are invisible to non-members

A group, its membership, and its tasks SHALL be readable only by members of
that group. A non-member SHALL be unable to determine whether a given group
exists, how many members it has, or what it contains.

#### Scenario: A non-member requests a group directly by its identifier

- **WHEN** a signed-in user who is not a member requests a group by its
  identifier
- **THEN** the response SHALL contain no records
- **AND** it SHALL be indistinguishable from a request for a group that does
  not exist

#### Scenario: A non-member requests the tasks of a group

- **WHEN** a signed-in user who is not a member requests that group's tasks
- **THEN** the response SHALL contain no records

#### Scenario: An anonymous caller requests any group

- **WHEN** a request carrying no user session asks for groups
- **THEN** the response SHALL contain no records

### Requirement: Membership is granted only by redeeming a code

A user SHALL join a group only by redeeming that group's join code. Adding
oneself or anyone else to a group directly SHALL be refused. Redeeming a code
SHALL be the sole path by which a caller learns a group's identifier.

This exists because a non-member cannot read groups, and therefore cannot look
one up by its code through an ordinary query. The redemption step is the one
privileged lookup in the system and SHALL disclose nothing beyond the group
being joined.

#### Scenario: A valid code is redeemed

- **WHEN** a signed-in user redeems a code matching an existing group
- **THEN** they SHALL become a member of that group
- **AND** the group's identifier SHALL be returned
- **AND** they SHALL thereafter be able to read the group and its tasks

#### Scenario: An unknown code is redeemed

- **WHEN** a signed-in user redeems a code matching no group
- **THEN** the result SHALL indicate that no group was found
- **AND** it SHALL disclose nothing about any other group

#### Scenario: A user attempts to add themselves without a code

- **WHEN** a user submits a membership record naming themselves and a group
- **THEN** the write SHALL be refused

#### Scenario: A code is redeemed twice by the same user

- **WHEN** a user who is already a member redeems the same code again
- **THEN** the request SHALL succeed without creating a second membership

#### Scenario: An anonymous caller redeems a code

- **WHEN** a caller with no session redeems a code
- **THEN** the request SHALL be refused

### Requirement: The creator is always a member

Creating a group SHALL make the creator a member of it in the same operation,
so that no group can exist which its own creator cannot read.

#### Scenario: A group is created

- **WHEN** a signed-in user creates a group
- **THEN** they SHALL immediately be a member of it
- **AND** they SHALL be recorded as its owner

#### Scenario: A user creates a group naming someone else as owner

- **WHEN** a user submits a group whose owner is a different user
- **THEN** the write SHALL be refused

### Requirement: Administration is reserved to the owner

Renaming or deleting a group SHALL be permitted only to its owner. Any member
SHALL be able to leave. The owner SHALL be able to remove any member.

#### Scenario: A member attempts to delete the group

- **WHEN** a member who is not the owner submits a deletion for the group
- **THEN** the group SHALL NOT be deleted

#### Scenario: A member leaves

- **WHEN** a member removes their own membership
- **THEN** they SHALL cease to be a member
- **AND** they SHALL no longer be able to read the group or its tasks

#### Scenario: A group is deleted

- **WHEN** the owner deletes the group
- **THEN** its membership records and its tasks SHALL be removed with it

### Requirement: Group tasks are independent records

Each group task SHALL be stored as a record in its own right. Completing,
editing, or removing one group task SHALL NOT rewrite or otherwise disturb any
other task in the group.

This is a correction of prior behaviour. Group tasks were previously held
together in a single nested collection, so two members acting at the same time
could overwrite one another's change without either being told.

#### Scenario: Two members complete different tasks at the same time

- **WHEN** two members each mark a different task in the same group complete,
  concurrently
- **THEN** both completions SHALL be preserved

#### Scenario: A task is removed from a group

- **WHEN** a member removes one task
- **THEN** every other task in that group SHALL remain unchanged

#### Scenario: A member adds a task attributed to someone else

- **WHEN** a member submits a task naming a different user as its creator
- **THEN** the write SHALL be refused

### Requirement: Members see changes as they happen

Changes to a group's tasks SHALL be delivered to every member currently viewing
that group without requiring them to reload or poll. Delivery SHALL respect
membership, so a non-member SHALL receive nothing.

#### Scenario: A member adds a task while another member is viewing

- **WHEN** one member adds a task to a group
- **THEN** other members viewing that group SHALL see it appear without
  reloading

#### Scenario: A former member is viewing when a change occurs

- **WHEN** a user who has left the group would otherwise receive an update
- **THEN** no group content SHALL be delivered to them
