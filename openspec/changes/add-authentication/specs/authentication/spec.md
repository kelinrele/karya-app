## Purpose

Obtaining a session, holding it across reloads, and ending it completely, so
that the access control proved in the previous change has a real identity to
act on. Also the profile record every authenticated user is expected to have,
and the guarantee that a guest never acquires a session at all.

## ADDED Requirements

### Requirement: A session survives a page reload

A user who has signed in SHALL remain signed in across a page reload and across
closing and reopening the browser, until the session expires or is ended
deliberately. Restoring a session SHALL NOT require the user to present
credentials again. The application SHALL treat the restored session as
authoritative for identity rather than reading any separately stored copy of
the user record.

#### Scenario: A signed-in user reloads the page

- **WHEN** a user with a valid session reloads the application
- **THEN** the application SHALL recognise the same user without a further
  credential prompt
- **AND** requests made after the reload SHALL return that user's records

#### Scenario: A stored session has expired

- **WHEN** the application starts and the stored session can no longer be
  refreshed
- **THEN** the application SHALL treat the user as signed out
- **AND** SHALL NOT present stale user details as though the session were live

### Requirement: Signing out ends access, not merely display

Signing out SHALL invalidate the session and remove it from browser storage. It
SHALL NOT be sufficient to clear the user from application state while a usable
token remains. After signing out, a request SHALL return no personal records.

#### Scenario: A user signs out

- **WHEN** a signed-in user signs out
- **THEN** no session SHALL remain in browser storage
- **AND** a subsequent request for that user's tasks SHALL return no records

#### Scenario: A token retained from before sign-out is replayed

- **WHEN** a request presents an access token captured before the user signed
  out
- **THEN** the request SHALL be refused or SHALL return no records
- **AND** the response SHALL be indistinguishable from one made with no session

### Requirement: Every authenticated user has a profile

A profile record SHALL exist for every user in the authentication store, and
SHALL be created as part of user creation rather than by the client afterwards.
The profile SHALL carry a display name derived from whatever the sign-in method
provided, falling back to the local part of the email address when no name is
available. Creating a user twice SHALL NOT produce a second profile or an
error.

#### Scenario: A user signs up with email and password

- **WHEN** a new user is created through email and password sign-up
- **THEN** exactly one profile record SHALL exist for that user
- **AND** its display name SHALL be the local part of the email address

#### Scenario: A user arrives from an identity provider carrying a name

- **WHEN** a new user is created with a full name in the metadata the provider
  supplied
- **THEN** the profile display name SHALL be that name rather than a value
  derived from the email address

#### Scenario: A client attempts to create a profile for another user

- **WHEN** a signed-in user submits a profile record naming a different user's
  identifier
- **THEN** the write SHALL be refused
- **AND** no profile record SHALL be created or altered

### Requirement: A guest never obtains a session

A user who has not signed in SHALL NOT be issued a session of any kind, and
anonymous sign-in SHALL remain disabled. Guest data SHALL remain in browser
storage and SHALL NOT be written to the database under any identity. No record
in the database SHALL be owned by an unidentified user.

#### Scenario: Anonymous sign-in is requested

- **WHEN** a request asks for an anonymous session
- **THEN** it SHALL be refused
- **AND** no user record SHALL be created

#### Scenario: A guest uses the application

- **WHEN** a person uses the application without signing in
- **THEN** their tasks and ideas SHALL be held in browser storage only
- **AND** no request carrying their data SHALL be made to the database

### Requirement: The public key alone grants nothing

The publishable API key is distributed in the browser bundle and SHALL be
treated as public. Holding it SHALL confer no read or write access to any
user's records. Every access decision SHALL depend on the session accompanying
the request, never on the key.

#### Scenario: A request presents the public key and no session

- **WHEN** a request carries the publishable key with no user session
- **THEN** it SHALL return no personal records
- **AND** it SHALL NOT disclose whether any records exist

#### Scenario: A request presents the public key with a valid session

- **WHEN** the same request carries a valid session for a user with records
- **THEN** it SHALL return that user's records
- **AND** the difference in outcome SHALL be attributable to the session alone
