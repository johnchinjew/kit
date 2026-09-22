module TaskCreationTest exposing (tests)

import Expect
import Session
import TaskCreation
import Test exposing (Test)


tests : Test
tests =
    Test.describe "TaskCreation"
        [ Test.test "clears the draft and pending request when signing out" <|
            \_ ->
                case TaskCreation.submit (TaskCreation.setTitle "Alice's draft" TaskCreation.empty) of
                    Nothing ->
                        Expect.fail "The first task should start creation"

                    Just ( _, pending ) ->
                        let
                            drafted =
                                TaskCreation.setTitle "Another draft" pending

                            cleared =
                                TaskCreation.handleSessionMsg (Session.AuthChanged Nothing) drafted
                        in
                        Expect.equal
                            ( "", False )
                            ( TaskCreation.title cleared, TaskCreation.isPending cleared )
        , Test.test "clears the draft and pending request when signing in" <|
            \_ ->
                case TaskCreation.submit (TaskCreation.setTitle "Alice's draft" TaskCreation.empty) of
                    Nothing ->
                        Expect.fail "The first task should start creation"

                    Just ( _, pending ) ->
                        let
                            user =
                                { photoUrl = Nothing }

                            cleared =
                                TaskCreation.handleSessionMsg
                                    (Session.AuthChanged (Just user))
                                    (TaskCreation.setTitle "Another draft" pending)
                        in
                        Expect.equal
                            ( "", False )
                            ( TaskCreation.title cleared, TaskCreation.isPending cleared )
        , Test.test "allows another task after creation completes" <|
            \_ ->
                case TaskCreation.submit (TaskCreation.setTitle "Buy milk" TaskCreation.empty) of
                    Nothing ->
                        Expect.fail "The first task should start creation"

                    Just ( _, pending ) ->
                        TaskCreation.handleSessionMsg (Session.CreateTaskOutcome Nothing) pending
                            |> TaskCreation.isPending
                            |> Expect.equal False
        , Test.test "ignores a second request while creation is pending" <|
            \_ ->
                case TaskCreation.submit (TaskCreation.setTitle "Buy milk" TaskCreation.empty) of
                    Nothing ->
                        Expect.fail "The first task should start creation"

                    Just ( _, pending ) ->
                        Expect.equal Nothing (TaskCreation.submit (TaskCreation.setTitle "Buy eggs" pending))
        ]
