module UserData exposing (UserData, createTask, decoder, empty, encode)

import Firestore
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode
import Task_ exposing (Task)


type alias UserData =
    { tasks : List Task
    }


empty : UserData
empty =
    { tasks = [] }


decoder : Decoder UserData
decoder =
    Decode.field "tasks" (Decode.keyValuePairs (Decode.field "title" Decode.string))
        |> Decode.andThen
            (\tasks ->
                if List.any (Tuple.first >> String.trim >> String.isEmpty) tasks then
                    Decode.fail "Task ID must not be blank"

                else
                    Decode.succeed { tasks = List.map (\( id, title ) -> Task id title) tasks }
            )


encode : UserData -> Encode.Value
encode userData =
    Encode.object
        [ ( "tasks"
          , Encode.object
                (List.map
                    (\task ->
                        ( task.id, Encode.object [ ( "title", Encode.string task.title ) ] )
                    )
                    userData.tasks
                )
          )
        ]


createTask : Task -> Encode.Value
createTask task =
    Encode.object
        [ ( "tasks"
          , Encode.object
                [ ( task.id, Encode.object [ ( "title", Firestore.value (Encode.string task.title) ) ] ) ]
          )
        ]
        |> Firestore.setDoc { merge = True }
