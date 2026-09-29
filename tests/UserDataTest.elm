module UserDataTest exposing (tests)

import Expect
import Json.Decode as Decode
import Json.Encode as Encode
import Test exposing (Test)
import UserData


tests : Test
tests =
    Test.describe "User data codec"
        ([ Test.test "creates a narrow task patch and selects merged setDoc" <|
            \_ ->
                UserData.createTask { id = "task-1", title = "Buy milk" }
                    |> Encode.encode 0
                    |> Expect.equal """{"merge":true,"patch":{"tasks":{"task-1":{"title":{"$op":"value","value":"Buy milk"}}}}}"""
         , Test.test "decodes UUID keys and ignores unexpected fields including version" <|
            \_ ->
                Decode.decodeString UserData.decoder
                    """{"version":"ignored","tasks":{"task-1":{"title":"Buy milk","unexpected":true}}}"""
                    |> Expect.equal (Ok { tasks = [ { id = "task-1", title = "Buy milk" } ] })
         , Test.test "round trips unversioned document content including IDs" <|
            \_ ->
                let
                    data =
                        { tasks = [ { id = "task-1", title = "Buy milk" }, { id = "task-2", title = "" } ] }
                in
                UserData.encode data
                    |> Decode.decodeValue UserData.decoder
                    |> Expect.equal (Ok data)
         , Test.test "encodes tasks as a map without a version or redundant IDs" <|
            \_ ->
                UserData.encode { tasks = [ { id = "task-1", title = "Buy milk" } ] }
                    |> Encode.encode 0
                    |> Expect.equal """{"tasks":{"task-1":{"title":"Buy milk"}}}"""
         , Test.test "decodes an empty tasks map" <|
            \_ ->
                Decode.decodeString UserData.decoder """{"tasks":{}}"""
                    |> Expect.equal (Ok UserData.empty)
         ]
            ++ List.map
                (\( name, document ) ->
                    Test.test name <|
                        \_ ->
                            Decode.decodeString UserData.decoder document |> Expect.err
                )
                [ ( "rejects missing tasks", "{}" )
                , ( "rejects null tasks", """{"tasks":null}""" )
                , ( "rejects array tasks", """{"tasks":[]}""" )
                , ( "rejects null documents", "null" )
                , ( "rejects array documents", "[]" )
                , ( "rejects string documents", "\"invalid\"" )
                , ( "rejects empty task IDs", """{"tasks":{"":{"title":"Invalid"}}}""" )
                , ( "rejects whitespace task IDs", """{"tasks":{"  ":{"title":"Invalid"}}}""" )
                , ( "rejects the whole document for a missing title", """{"tasks":{"valid":{"title":"Keep me"},"invalid":{}}}""" )
                , ( "rejects non-string titles", """{"tasks":{"id":{"title":false}}}""" )
                , ( "rejects null task values", """{"tasks":{"id":null}}""" )
                , ( "rejects string task values", """{"tasks":{"id":"invalid"}}""" )
                ]
        )
