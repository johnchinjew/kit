module TaskCreationTest exposing (tests)

import Expect
import TaskCreation
import Test exposing (Test)


tests : Test
tests =
    Test.describe "Task creation"
        [ Test.test "clears the submitted title and preserves a new draft after UUID generation" <|
            \_ ->
                let
                    ( awaitingUuid, firstNotice, _ ) =
                        TaskCreation.setTitle "  Buy milk  " TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    ( submitted, secondNotice, _ ) =
                        TaskCreation.setTitle "Next draft" awaitingUuid
                            |> TaskCreation.update (TaskCreation.UuidGenerated "generated-id")
                in
                Expect.equal
                    ( ( Nothing, "", True )
                    , ( Nothing, "Next draft", False )
                    )
                    ( ( firstNotice, TaskCreation.title awaitingUuid, TaskCreation.isPending awaitingUuid )
                    , ( secondNotice, TaskCreation.title submitted, TaskCreation.isPending submitted )
                    )
        , Test.test "ignores blank titles" <|
            \_ ->
                let
                    draft =
                        TaskCreation.setTitle "   " TaskCreation.empty

                    ( actual, notice, _ ) =
                        TaskCreation.update TaskCreation.Submit draft
                in
                Expect.equal ( draft, Nothing ) ( actual, notice )
        , Test.test "ignores submissions while UUID generation is pending" <|
            \_ ->
                let
                    ( awaitingUuid, _, _ ) =
                        TaskCreation.setTitle "Buy milk" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    withDraft =
                        TaskCreation.setTitle "Buy eggs" awaitingUuid

                    ( actual, notice, _ ) =
                        TaskCreation.update TaskCreation.Submit withDraft
                in
                Expect.equal ( withDraft, Nothing ) ( actual, notice )
        , Test.test "allows another task before the previous write completes" <|
            \_ ->
                let
                    ( awaitingUuid, _, _ ) =
                        TaskCreation.setTitle "Buy milk" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    ( submitted, writeNotice, _ ) =
                        TaskCreation.update (TaskCreation.UuidGenerated "task-1") awaitingUuid

                    ( nextRequest, nextNotice, _ ) =
                        TaskCreation.setTitle "Buy eggs" submitted
                            |> TaskCreation.update TaskCreation.Submit
                in
                Expect.equal
                    ( Nothing, Nothing, True )
                    ( writeNotice, nextNotice, TaskCreation.isPending nextRequest )
        , Test.test "UUID failures release the pending operation and report failure" <|
            \_ ->
                let
                    ( awaitingUuid, _, _ ) =
                        TaskCreation.setTitle "Buy milk" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    ( failed, notice, _ ) =
                        TaskCreation.update (TaskCreation.UuidFailed "unknown") awaitingUuid
                in
                Expect.equal ( ( False, "" ), Just "Could not add task. Please try again." ) ( ( TaskCreation.isPending failed, TaskCreation.title failed ), notice )
        , Test.test "late write failures preserve the next request and its draft" <|
            \_ ->
                let
                    ( firstRequest, _, _ ) =
                        TaskCreation.setTitle "Buy milk" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    ( submitted, _, _ ) =
                        TaskCreation.update (TaskCreation.UuidGenerated "task-1") firstRequest

                    ( nextRequest, _, _ ) =
                        TaskCreation.setTitle "Buy eggs" submitted
                            |> TaskCreation.update TaskCreation.Submit

                    withDraft =
                        TaskCreation.setTitle "Buy bread" nextRequest

                    ( actual, notice, _ ) =
                        TaskCreation.update (TaskCreation.WriteFailed "permission-denied") withDraft
                in
                Expect.equal
                    ( withDraft, Just "Could not add task. Please try again." )
                    ( actual, notice )
        , Test.test "write failures show a notice even when nothing is pending" <|
            \_ ->
                let
                    draft =
                        TaskCreation.setTitle "Buy eggs" TaskCreation.empty

                    ( actual, notice, _ ) =
                        TaskCreation.update (TaskCreation.WriteFailed "permission-denied") draft
                in
                Expect.equal
                    ( draft, Just "Could not add task. Please try again." )
                    ( actual, notice )
        , Test.test "auth changes clear the draft and allow a new request without waiting for the old UUID" <|
            \_ ->
                let
                    ( awaitingUuid, _, _ ) =
                        TaskCreation.setTitle "Alice's task" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    reset =
                        TaskCreation.setTitle "Alice's next draft" awaitingUuid |> TaskCreation.reset

                    newDraft =
                        TaskCreation.setTitle "Bob's task" reset

                    ( submitted, notice, _ ) =
                        TaskCreation.update TaskCreation.Submit newDraft
                in
                Expect.equal
                    ( TaskCreation.empty, True, Nothing )
                    ( reset, TaskCreation.isPending submitted, notice )
        , Test.test "auth changes clear the draft and allow a new request without waiting for the old write" <|
            \_ ->
                let
                    ( awaitingUuid, _, _ ) =
                        TaskCreation.setTitle "Alice's task" TaskCreation.empty
                            |> TaskCreation.update TaskCreation.Submit

                    ( previousTask, _, _ ) =
                        TaskCreation.update (TaskCreation.UuidGenerated "alice-id") awaitingUuid

                    reset =
                        TaskCreation.setTitle "Alice's next draft" previousTask |> TaskCreation.reset

                    ( submitted, notice, _ ) =
                        TaskCreation.setTitle "Bob's task" reset
                            |> TaskCreation.update TaskCreation.Submit
                in
                Expect.equal
                    ( TaskCreation.empty, True, Nothing )
                    ( reset, TaskCreation.isPending submitted, notice )
        , Test.test "ignores unsolicited UUID outcomes" <|
            \_ ->
                [ TaskCreation.UuidGenerated "stale-id"
                , TaskCreation.UuidFailed "unknown"
                ]
                    |> List.map
                        (\msg ->
                            let
                                ( state, notice, _ ) =
                                    TaskCreation.update msg TaskCreation.empty
                            in
                            ( state, notice )
                        )
                    |> Expect.equal (List.repeat 2 ( TaskCreation.empty, Nothing ))
        ]
